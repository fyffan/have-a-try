import { App, Editor, TFile, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';
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
        container.createEl('h3', { text: '✍️ 实时写作统计' });
        
        // 创建内容容器
        const contentEl = container.createDiv('stats-container');
        
        // 初始化渲染
        this.updateView(contentEl);
        
        // 设置定时更新
        this.intervalId = window.setInterval(() => {
            contentEl.empty(); // 清空后重新渲染
            this.updateView(contentEl);
        }, 1000);
    }

	async onClose() {
        window.clearInterval(this.intervalId);
    }

    private updateView(container: HTMLElement) {
		// 使用传入的容器元素
        container.createDiv({ 
            text: `🕒 总时长：${this.plugin.formatTime(this.plugin.totalDuration)}`,
            cls: 'stat-item'
        });

        if (!this.contentEl) return;
        
        this.contentEl.empty();
        this.contentEl.createEl('h3', { text: '状态统计' });

        // 创建统计展示容器
        const statsContainer = this.contentEl.createDiv('stats-container');
        
        // 添加统计数据
        statsContainer.createDiv({ 
            text: `总时长：${this.plugin.formatTime(this.plugin.totalDuration)}`,
            cls: 'stat-item'
        });
        
        statsContainer.createDiv({ 
            text: `空闲时间：${this.plugin.formatTime(this.plugin.totalIdleTime)}`,
            cls: 'stat-item'
        });
        
        statsContainer.createDiv({ 
            text: `有效时间：${this.plugin.formatTime(this.plugin.effectiveTypingTime)}`,
            cls: 'stat-item'
        });
        
        statsContainer.createDiv({ 
            text: `本次字数：${this.plugin.currentSessionWordCount}`,
            cls: 'stat-item'
        });

        const instantSpeed = this.plugin.calculateInstantSpeed();
        statsContainer.createDiv({ 
            text: `当前速度：${instantSpeed.toFixed(1)} 字/小时`,
            cls: 'stat-item'
        });

        const averageSpeed = this.plugin.effectiveTypingTime > 0 
            ? (this.plugin.currentSessionWordCount / (this.plugin.effectiveTypingTime / 3600))
            : 0;
        statsContainer.createDiv({ 
            text: `平均速度：${averageSpeed.toFixed(1)} 字/小时`,
            cls: 'stat-item'
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
};

// export default class TypingStatsPlugin extends Plugin {
//     settings: TypingStatsSettings;
//     statusBarItemEl: HTMLElement;

//     typingStartTime: number | null = null; // 记录打字开始时间
//     lastTypedTime: number = 0; // 记录最后打字时间
//     totalDuration: number = 0; // 总时长（秒）
//     effectiveTypingTime: number = 0; // 有效写作时间（秒）
//     totalIdleTime: number = 0; // 摸鱼时长（秒）
//     lastWordCount: number = 0; // 当前文档总字数
//     isIdle: boolean = false; // 是否进入摸鱼状态
//     isPaused: boolean = false; // 是否暂停计时

//     wordHistory: { timestamp: number, charCount: number }[] = []; // 记录最近的字数变化

//     async onload() {
//         await this.loadSettings();

//         this.statusBarItemEl = this.addStatusBarItem();
//         this.statusBarItemEl.setText('Typing Stats: 等待打字...');

//         this.registerEvent(
//             this.app.workspace.on('editor-change', (editor: Editor) => {
//                 this.handleTyping(editor);
//             })
//         );

//         this.registerEvent(
//             this.app.workspace.on('quit', () => {
//                 this.endTypingSession();
//             })
//         );

//         this.registerInterval(window.setInterval(() => {
//             this.updateStats();
//         }, this.settings.updateInterval));

//         this.addSettingTab(new TypingStatsSettingTab(this.app, this));
//     }

//     onunload() {
//         this.endTypingSession();
//     }

//     async loadSettings() {
//         this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
//     }

//     async saveSettings() {
//         await this.saveData(this.settings);
//     }

//     handleTyping(editor: Editor) {
//         const currentTime = Date.now();
//         const content = editor.getValue();
//         const charCount = content.replace(/\s/g, "").length; // 计算去空格字数

//         if (charCount === 0) return;

//         // 继续打字时恢复计时
//         if (this.isPaused) {
//             this.isPaused = false;
//             this.typingStartTime = currentTime - this.totalDuration * 1000; // 恢复原时间基准
//             this.statusBarItemEl.setText("计时恢复，继续写作...");
//         }

//         if (this.typingStartTime === null) {
//             this.typingStartTime = currentTime;
//             this.totalDuration = 0;
//             this.effectiveTypingTime = 0;
//             this.totalIdleTime = 0;
//         }

//         // 计算摸鱼时间
//         if (this.lastTypedTime > 0) {
//             const idleTime = (currentTime - this.lastTypedTime) / 1000;
//             if (idleTime > this.settings.idleThreshold) {
//                 this.isIdle = true;
//             }
//         }

//         if (this.isIdle) {
//             this.isIdle = false; // 退出摸鱼状态
//         }

//         this.lastTypedTime = currentTime;
//         this.lastWordCount = charCount;

//         // 记录最近 5 秒的字数
//         this.wordHistory.push({ timestamp: currentTime, charCount });
//         this.cleanWordHistory();
//     }

//     updateStats() {
//         if (this.typingStartTime === null || this.isPaused) return;

//         const currentTime = Date.now();
//         const elapsedTime = (currentTime - this.typingStartTime) / 1000; // 总时长
//         const lastIdleTime = (currentTime - this.lastTypedTime) / 1000; // 计算当前空闲时长

//         // **处理摸鱼逻辑**
//         if (lastIdleTime > this.settings.idleThreshold) {
//             if (!this.isIdle) {
//                 this.isIdle = true;
//                 this.statusBarItemEl.setText("进入摸鱼状态...");
//             }
//             this.totalIdleTime += this.settings.updateInterval / 1000; // 继续累计摸鱼时长
//         } else if (this.isIdle) {
//             this.isIdle = false;
//         }

//         // 超过写作结束阈值，暂停计时
//         if (lastIdleTime > this.settings.stopThreshold) {
//             this.isPaused = true;
//             this.statusBarItemEl.setText("计时已暂停（超时未打字），继续打字将恢复...");
//             return;
//         }

//         this.totalDuration = elapsedTime;
//         this.effectiveTypingTime = Math.max(this.totalDuration - this.totalIdleTime, 0);

//         // 计算瞬时码字速度和平均码字速度（字/小时）
//         const instantSpeed = this.calculateInstantSpeed();
//         const averageSpeed = this.effectiveTypingTime > 0 ? (this.lastWordCount / (this.effectiveTypingTime / 3600)) : 0;

//         this.statusBarItemEl.setText(
//             `总时长: ${this.formatTime(this.totalDuration)} | 摸鱼: ${this.formatTime(this.totalIdleTime)} | 写作: ${this.formatTime(this.effectiveTypingTime)} | 字数: ${this.lastWordCount} | 瞬时: ${instantSpeed.toFixed(1)}字/小时 | 平均: ${averageSpeed.toFixed(1)}字/小时`
//         );
//     }

//     endTypingSession() {
//         if (this.typingStartTime === null) return;

//         this.totalDuration = (Date.now() - this.typingStartTime) / 1000;
//         this.typingStartTime = null;
//         this.lastTypedTime = 0;

//         const effectiveTypingTime = Math.max(this.totalDuration - this.totalIdleTime, 0);
//         const instantSpeed = this.calculateInstantSpeed();
//         const averageSpeed = effectiveTypingTime > 0 ? (this.lastWordCount / (effectiveTypingTime / 60)) : 0;

//         this.statusBarItemEl.setText(
//             `最终: 总时长: ${this.formatTime(this.totalDuration)} | 摸鱼: ${this.formatTime(this.totalIdleTime)} | 写作: ${this.formatTime(effectiveTypingTime)} | 字数: ${this.lastWordCount} | 瞬时: ${instantSpeed.toFixed(1)}字/分 | 平均: ${averageSpeed.toFixed(1)}字/分`
//         );
//     }

//     formatTime(seconds: number): string {
//         const minutes = Math.floor(seconds / 60);
//         const secs = Math.floor(seconds % 60);
//         return `${minutes}分${secs}秒`;
//     }

//     cleanWordHistory() {
//         const now = Date.now();
//         this.wordHistory = this.wordHistory.filter(entry => now - entry.timestamp <= 5000);
//     }

//     calculateInstantSpeed(): number {
//         if (this.wordHistory.length < 2) return 0;

//         const first = this.wordHistory[0];
//         const last = this.wordHistory[this.wordHistory.length - 1];
//         const deltaTime = (last.timestamp - first.timestamp) / 1000; // 秒
//         const deltaWords = last.charCount - first.charCount;

//         return deltaTime > 0 ? (deltaWords / (deltaTime / 3600)) : 0; // 转换成字/小时
//     }
// }

export default class TypingStatsPlugin extends Plugin {
    settings: TypingStatsSettings;
    statusBarItemEl: HTMLElement;

    typingStartTime: number | null = null;
    lastTypedTime: number = 0;
    totalDuration: number = 0;
    effectiveTypingTime: number = 0;
    totalIdleTime: number = 0;
    isIdle: boolean = false;
    isPaused: boolean = false;

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

    onunload() {
        this.endTypingSession();
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

        // 记录最近 5 秒的字数
        this.wordHistory.push({ timestamp: currentTime, charCount });
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
        const now = Date.now();
        this.wordHistory = this.wordHistory.filter(entry => now - entry.timestamp <= 5000);
    }

    calculateInstantSpeed(): number {
        if (this.wordHistory.length < 2) return 0;

        const first = this.wordHistory[0];
        const last = this.wordHistory[this.wordHistory.length - 1];
        const deltaTime = (last.timestamp - first.timestamp) / 1000;
        const deltaWords = last.charCount - first.charCount;

        return deltaTime > 0 ? (deltaWords / (deltaTime / 3600)) : 0;
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
}


