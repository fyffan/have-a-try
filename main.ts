import { App, Editor, TFile, Notice, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { ItemView, WorkspaceLeaf } from 'obsidian';

const VIEW_TYPE_STATS = 'typing-stats-view';

class StatsView extends ItemView {
    private intervalId: number;
	private plugin: TypingStatsPlugin;


    constructor(leaf: WorkspaceLeaf, plugin: TypingStatsPlugin) {
        super(leaf);
		this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_STATS;
    }

    getDisplayText() {
        return '打字统计';
    }

    getIcon(): string {
        return "line-chart"; // Obsidian的内置图标名称
    }

    async onOpen() {
        // 使用基类提供的 containerEl
        const container = this.containerEl.children[1];
        container.empty();
  
        // 创建内容容器
        const contentEl = container.createDiv('stats-container');
        
        // 初始化渲染
        this.updateView(contentEl);

        const stopButton = container.createDiv('stats-stop-button');
        stopButton.createEl('button', {
            text: '⏹ 终止',
            cls: 'typing-stop-button',
        }).addEventListener('click', async () => {
            await this.plugin.handleStop();
        });

        const copyButton = container.createDiv('stats-copy-button');
        copyButton.createEl('button', {
            text: '⏹ 复制',
            cls: 'typing-copy-button',
        }).addEventListener('click', async () => {
            // await this.plugin.handleStop();
            // await this.plugin.insertStatsToDocument();
            await this.plugin.copyStatsToClipboard();
        });

        // 添加重新开始按钮
        const restartButton = container.createDiv('stats-restart-button');
        restartButton.createEl('button', {
            text: '🔄 重置',
            cls: 'typing-restart-button',
        }).addEventListener('click', () => this.plugin.handleRestart());

        // 设置定时更新
        this.intervalId = window.setInterval(() => {
            contentEl.empty(); // 清空后重新渲染
            this.updateView(contentEl);
        }, 1000);
    }

	async onClose() {
        window.clearInterval(this.intervalId);
        this.containerEl.empty();
    }

    private updateView(container: HTMLElement) {
		// 使用传入的容器元素
        if (!container) return
        
        container.empty();
        container.createEl('div', { 
            text: '✍️ 实时打字统计',
        });

        // 创建统计展示容器
        const statsContainer = container.createDiv('stats-container');
        
        // 添加统计数据
        statsContainer.createDiv({ 
            text: `🕒 打字时长：${this.plugin.formatTime(this.plugin.totalDuration)}`,
            // cls: 'stat-item'
        });
        
        statsContainer.createDiv({ 
            text: `🐟 空闲时间：${this.plugin.formatTime(this.plugin.totalIdleTime)}`,
            // cls: 'stat-item'
        });
        
        statsContainer.createDiv({ 
            text: `✏️ 有效时间：${this.plugin.formatTime(this.plugin.effectiveTypingTime)}`,
            // cls: 'stat-item'
        });
        
        statsContainer.createDiv({ 
            text: `📝 本次字数：${this.plugin.currentSessionWordCount}`,
            // cls: 'stat-item'
        });

        const instantSpeed = this.plugin.calculateInstantSpeed();
        statsContainer.createDiv({ 
            text: `🚀 当前时速：${instantSpeed.toFixed(1)} 字/小时`,
            // cls: 'stat-item'
        });

        const averageSpeed = this.plugin.effectiveTypingTime > 0 
            ? (this.plugin.currentSessionWordCount / (this.plugin.effectiveTypingTime / 3600))
            : 0;
        statsContainer.createDiv({ 
            text: `📈 平均速度：${averageSpeed.toFixed(1)} 字/小时`,
            // cls: 'stat-item'
        });

    }


    
}

interface TypingStatsSettings {
    updateInterval: number; // 刷新间隔（毫秒）
    idleThreshold: number;  // 多少秒不打字算作摸鱼
    stopThreshold: number;  // 多少秒不打字算作停止写作
}

const DEFAULT_SETTINGS: TypingStatsSettings = {
    updateInterval: 1000, // 每秒刷新
    idleThreshold: 10, // 超过 10 秒算作短暂休息（不影响有效时长）
    stopThreshold: 120 // 2 分钟（120 秒）不打字则暂停计时
}

export default class TypingStatsPlugin extends Plugin {
    settings: TypingStatsSettings;
    statusBarItemEl: HTMLElement;
    stopButtonEl: HTMLElement | null = null;
    showViews: StatsView;

    typingStartTime: number | null = null;
    lastTypedTime: number = 0;
    totalDuration: number = 0;
    effectiveTypingTime: number = 0;
    totalIdleTime: number = 0;
    isIdle: boolean = false;
    isPaused: boolean = false;
    isStopped: boolean = false;

    initialWordCount: number | null = null; // 记录本次写作周期起始字数
    currentSessionWordCount: number = 0; // 本次写作周期的字数
    wordHistory: { timestamp: number, charCount: number }[] = [];

	async onload() {
        await this.loadSettings();

        this.statusBarItemEl = this.addStatusBarItem();
        this.statusBarItemEl.setText('Typing Stats: 等待打字...');

        // 监听文档编辑器变化
        this.registerEvent(
            this.app.workspace.on('editor-change', (editor: Editor) => {
                this.handleTyping(editor);
            })
        );


        this.app.workspace.on("editor-change", (editor) => this.updateStats());

		// 监听打开新文件
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				this.endTypingSession(); // 每次打开新文件时清空数据
				this.resetTypingStats(); // 每次打开新文件时重置状态
			})
		);

		// 注册视图
        this.registerView(
            VIEW_TYPE_STATS,
            (leaf) => new StatsView(leaf, this)
        );

		// 添加侧边栏图标
        this.addRibbonIcon('line-chart', '显示码字状态', () => {
            this.activateView();
        });

        this.registerInterval(window.setInterval(() => {
            this.updateStats();
        }, this.settings.updateInterval));

        this.addSettingTab(new TypingStatsSettingTab(this.app, this));
  
    }

    async copyStatsToClipboard() {
        const statsText = this.generateStatsContent();
        await navigator.clipboard.writeText(statsText);
    }

    // 处理停止操作
    async handleStop() {
        // 停止统计逻辑
        this.isPaused = true;
        this.typingStartTime = null;

        // 更新按钮状态
        if (this.stopButtonEl) {
            this.stopButtonEl.empty();
            this.stopButtonEl.createEl('span', {
                text: '已停止 | 单击状态栏图标重启',
                cls: 'typing-stopped-text',
            });
        }

        new Notice('已停止统计', 5000);

        this.isStopped = true;
    }

    async handleRestart() {
        // 重置所有统计
        this.resetTypingStats();
        
        // 初始化新会话
        this.initialWordCount = null;
        this.isStopped = false;
        this.isPaused = false;
        new Notice('已重置统计数据', 5000);
    }

    // 插入统计信息到文档
    async insertStatsToDocument() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        new Notice('没有活动页面', 5000);
        if (!activeView?.editor) return;
 
        const statsContent = this.generateStatsContent();
        const docEnd = activeView.editor.getCursor('to').line + 1;
 
        activeView.editor.replaceRange(
            `\n${statsContent}\n`,
            { line: docEnd, ch: 0 }
        );

        // 可选：显示完成通知
        new Notice('统计结果已插入文档末尾', 5000);
    }

    // 生成统计内容
    generateStatsContent(): string {
        return [
            '## ✍️ 写作统计',
            `- 总时长: ${this.formatTime(this.totalDuration)}`,
            `- 有效写作: ${this.formatTime(this.effectiveTypingTime)}`,
            `- 空闲时间: ${this.formatTime(this.totalIdleTime)}`,
            `- 本次字数: ${this.currentSessionWordCount}`,
            `- 平均速度: ${(this.currentSessionWordCount / (this.effectiveTypingTime / 3600)).toFixed(0)} 字/小时`,
            `- 记录时间: ${new Date().toLocaleString()}`,
            ''
        ].join('\n');
    }
 

	private async activateView() {
        const { workspace } = this.app;
 
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_STATS);
 
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf?.setViewState({
                type: VIEW_TYPE_STATS,
                active: true
            });
        }
 
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async onunload() {
        this.endTypingSession();
        // 手动清理视图
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_STATS);
         // 清理按钮
         if (this.stopButtonEl) {
            this.stopButtonEl.remove();
        }
        // 调用父类清理方法（自动清理通过 register* 方法注册的资源）
        super.onunload();
    }

	resetTypingStats() {
		this.statusBarItemEl.setText('Typing Stats: 等待打字...');
		this.initialWordCount = null;
		this.currentSessionWordCount = 0;
		this.totalDuration = 0;
		this.effectiveTypingTime = 0;
		this.totalIdleTime = 0;
		this.isIdle = false;
		this.isPaused = false;
		this.wordHistory = [];
	}

	async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }


    // 当检测到打字时调用
    handleTyping(editor: Editor) {
        const currentTime = Date.now();
        const content = editor.getValue();
        const charCount = content.replace(/\s/g, "").length; // 计算去空格字数

        if (charCount === 0) return;

        // +++ 新增暂停恢复逻辑 +++
        if (this.isPaused) {
            this.isPaused = false;
            // 补偿暂停期间的时间差
            const pauseDuration = currentTime - this.lastTypedTime - this.settings.stopThreshold * 1000;
            if (this.typingStartTime) {
                this.typingStartTime += pauseDuration;
            }
            this.statusBarItemEl.setText("计时恢复，继续打字...");
        }
        // +++ 结束新增 +++

        // **初始化本次写作周期的字数**
        if (this.initialWordCount === null) {
            this.initialWordCount = charCount;
            this.currentSessionWordCount = 0; // 第一次打字时重置
        }

        // 计算当前写作周期的字数
        this.currentSessionWordCount = Math.max(0, charCount - this.initialWordCount);

        if (this.typingStartTime === null) {
            this.typingStartTime = currentTime;
            this.totalDuration = 0;
            this.effectiveTypingTime = 0;
            this.totalIdleTime = 0;
        }

        // 计算摸鱼时间
        if (this.lastTypedTime > 0) {
            const idleTime = (currentTime - this.lastTypedTime) / 1000;
            if (idleTime > this.settings.idleThreshold) {
                this.isIdle = true;
            }
        }

        if (this.isIdle) {
            this.isIdle = false; // 退出摸鱼状态
        }

        this.lastTypedTime = currentTime;

        // 优化后的数据记录策略
        if (this.wordHistory.length === 0 || 
            currentTime - this.wordHistory[this.wordHistory.length-1].timestamp > 1000 // 至少1秒间隔
        ) {
            this.wordHistory.push({ 
                timestamp: currentTime, 
                charCount: this.currentSessionWordCount 
            });
        }
        
        this.cleanWordHistory();
    }

    updateStats() {
        if (this.typingStartTime === null || this.isPaused) return;

        const currentTime = Date.now();
        const elapsedTime = (currentTime - this.typingStartTime) / 1000; // 总时长
        const lastIdleTime = (currentTime - this.lastTypedTime) / 1000; // 计算当前空闲时长

        if (lastIdleTime > this.settings.idleThreshold) {
            if (!this.isIdle) {
                this.isIdle = true;
                this.statusBarItemEl.setText("进入摸鱼状态...");
            }
            this.totalIdleTime += this.settings.updateInterval / 1000;
        } else if (this.isIdle) {
            this.isIdle = false;
        }

        if (lastIdleTime > this.settings.stopThreshold) {
            this.isPaused = true;
            this.statusBarItemEl.setText("计时已暂停（超时未打字），继续打字将恢复...");
            return;
        }

        this.totalDuration = elapsedTime;
        this.effectiveTypingTime = Math.max(this.totalDuration - this.totalIdleTime, 0);

        // 计算瞬时码字速度和平均码字速度（字/小时）
        const instantSpeed = this.calculateInstantSpeed();
        const averageSpeed = this.effectiveTypingTime > 0 ? (this.currentSessionWordCount / (this.effectiveTypingTime / 3600)) : 0;

        this.statusBarItemEl.setText(
            `总时长: ${this.formatTime(this.totalDuration)} | 摸鱼: ${this.formatTime(this.totalIdleTime)} | 写作: ${this.formatTime(this.effectiveTypingTime)} | 本次写作字数: ${this.currentSessionWordCount} | 瞬时: ${instantSpeed.toFixed(1)}字/小时 | 平均: ${averageSpeed.toFixed(1)}字/小时`
        );
    }

    endTypingSession() {
        if (this.typingStartTime === null) return;

        this.totalDuration = (Date.now() - this.typingStartTime) / 1000;
        this.typingStartTime = null;
        this.lastTypedTime = 0;

        const effectiveTypingTime = Math.max(this.totalDuration - this.totalIdleTime, 0);
        const instantSpeed = this.calculateInstantSpeed();
        const averageSpeed = effectiveTypingTime > 0 ? (this.currentSessionWordCount / (effectiveTypingTime / 60)) : 0;

        this.statusBarItemEl.setText(
            `最终: 总时长: ${this.formatTime(this.totalDuration)} | 摸鱼: ${this.formatTime(this.totalIdleTime)} | 写作: ${this.formatTime(effectiveTypingTime)} | 本次写作字数: ${this.currentSessionWordCount} | 瞬时: ${instantSpeed.toFixed(1)}字/分 | 平均: ${averageSpeed.toFixed(1)}字/分`
        );

        // 重置统计数据，等待下一次写作
        this.initialWordCount = null;
        this.currentSessionWordCount = 0;
    }

	formatTime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const remainingSeconds = Math.floor(seconds % 60);
		
		// 使用 padStart 确保两位数格式
		const hh = hours.toString().padStart(2, '0');
		const mm = minutes.toString().padStart(2, '0');
		const ss = remainingSeconds.toString().padStart(2, '0');
		
		return `${hh}:${mm}:${ss}`;
	}

    cleanWordHistory() {
        // 保留最近30秒数据（为计算留出缓冲）
        const now = Date.now();
        this.wordHistory = this.wordHistory.filter(entry => 
            now - entry.timestamp <= 30000
        );
    }

    calculateInstantSpeed(): number {
        const now = Date.now();
        // 过滤有效数据窗口（最近10秒）
        const validEntries = this.wordHistory.filter(entry => 
            now - entry.timestamp <= 10000 && 
            entry.timestamp >= (this.typingStartTime || now)
        );
 
        if (validEntries.length < 2) return 0;
 
        // 时间衰减加权计算
        let totalWeight = 0;
        let totalSpeed = 0;
        
        // 从旧到新遍历（index 0 -> length-1）
        for (let i = 1; i < validEntries.length; i++) {
            const prev = validEntries[i - 1];
            const curr = validEntries[i];
            
            // 计算时间差（秒）
            const deltaTime = (curr.timestamp - prev.timestamp) / 1000;
            if (deltaTime <= 0) continue;
            
            // 计算字数变化
            const deltaWords = curr.charCount - prev.charCount;
            
            // 时间衰减因子（越新的数据权重越高）
            const timeFactor = 1 - (now - curr.timestamp) / 10000; // 0（10秒前） ~ 1（当前）
            const weight = deltaTime * (0.5 + 0.5 * timeFactor); // 基础权重 + 时间加权
            
            // 瞬时速度（字/小时）
            const speed = (deltaWords / deltaTime) * 3600;
            
            totalSpeed += speed * weight;
            totalWeight += weight;
        }
 
        // 处理摸鱼状态的平滑过渡
        if (this.isIdle) {
            const idleSeconds = (now - this.lastTypedTime) / 1000;
            const decayFactor = Math.max(0, 1 - idleSeconds / 5); // 5秒线性衰减
            return decayFactor * (totalWeight > 0 ? totalSpeed / totalWeight : 0);
        }
 
        return totalWeight > 0 ? totalSpeed / totalWeight : 0;
    }
}

class TypingStatsSettingTab extends PluginSettingTab {
    plugin: TypingStatsPlugin;

    constructor(app: App, plugin: TypingStatsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('数据刷新间隔 (毫秒)')
            .setDesc('控制打字统计信息更新的频率（默认1000毫秒）')
            .addText(text => text
                .setPlaceholder('输入刷新间隔')
                .setValue(this.plugin.settings.updateInterval.toString())
                .onChange(async (value) => {
                    const intValue = parseInt(value);
                    if (!isNaN(intValue) && intValue > 0) {
                        this.plugin.settings.updateInterval = intValue;
                        await this.plugin.saveSettings();
                    }
                }));

		new Setting(containerEl)
		.setName('摸鱼时间阈值（秒）')
		.setDesc('设定多少秒不打字算作摸鱼')
		.addText(text => text
			.setPlaceholder('输入秒数')
			.setValue(this.plugin.settings.idleThreshold.toString())
			.onChange(async (value) => {
				const intValue = parseInt(value);
				if (!isNaN(intValue) && intValue > 0) {
					this.plugin.settings.idleThreshold = intValue;
					await this.plugin.saveSettings();
				}
			}));

		new Setting(containerEl)
			.setName('停止写作阈值（秒）')
			.setDesc('设定多少秒不打字算作写作结束')
			.addText(text => text
				.setPlaceholder('输入秒数')
				.setValue(this.plugin.settings.stopThreshold.toString())
				.onChange(async (value) => {
					const intValue = parseInt(value);
					if (!isNaN(intValue) && intValue > 0) {
						this.plugin.settings.stopThreshold = intValue;
						await this.plugin.saveSettings();
					}
				}));
    }

    hide(): void {
        // 自动清理设置界面元素
        this.containerEl.empty();
    }
}


