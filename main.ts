// Jean Oustry - Made using https://github.com/obsidianmd/obsidian-sample-plugin template
import {
    App,
    Plugin,
    Notice,
    TFile,
    TFolder,
    Vault,
    PluginSettingTab,
    Menu,
    MenuItem,
} from 'obsidian'

import { sha3_512 } from 'js-sha3'

enum UriType {
    None = "none",
    Address = "address",
    Uri = "uri",
    Link = "link",
}


interface HAASettings {
    recapFolder: string;
    putFileContentInRecap: boolean;
    putConcatenatedFolderContentInRecap: boolean;
    createZipArchive: boolean;
    generateZipArchive: boolean;
    includeJustMdFiles: boolean;
    addRecapToZip: boolean;
    zipRecapName: string;
    uriType: UriType;
    pathListSuffix: string;
}

// The settings of the plugin.
const DEFAULT_SETTINGS: HAASettings = {
    recapFolder: "h_and_anteriorize_recaps",
    putFileContentInRecap: true,
    putConcatenatedFolderContentInRecap: true,
    createZipArchive: true,
    generateZipArchive: true,
    includeJustMdFiles: true,
    addRecapToZip: true,
    zipRecapName: "RECAP.md",
    uriType: UriType.Link,
    pathListSuffix: ".pathlist.txt",
}


export default class HAAPlugin extends Plugin {
    settings: HAASettings;
    alteredSettings: HAASettings;

    async getIndentedConcatenatedFolderContent(folder: TFolder) {
        const children_p: Array<Promise<string>> = [];
        Vault.recurseChildren(folder, (f: TFile | TFolder) => {
            if (f instanceof TFile && ((!this.settings.includeJustMdFiles) || f.extension === "md")) {
                children_p.push(this.app.vault.read(f));
            }
        });
        const children: Array<string> = [];
        for (let i = 0; i < children_p.length; i++) {
            children.push(await children_p[i]);
        }
        children.forEach((c, i) => children[i] = `\t${c.replace(/\n/g, "\n\t")}`);
        return children.join("\n\n---\n");
    }

    hexToDigit(finalHash: string) {
        let bigHash = BigInt(`0x${finalHash}`);
        const digitStrings = [];
        for (let i = 0; i < 6; ++i) {
            digitStrings.push((bigHash%BigInt(10**14)).toString());
            bigHash /= BigInt(10**14);
        }
        return digitStrings;
    }

    tableFactory(finalHash: string) {
        const a = "ethereum:0x0bcdFCFa14F8C28528AEE52D3EF2d010d1B88Bb4?amount=0.0000";
        const ordinaux = [
            "[First]",
            "[Second]",
            "[Third]",
            "[Fourth]",
            "[Fifth]",
            "[Sixth]",
        ]
        let tableString = `
| Transaction | Block ID |
| ------------|--------- |`
        this.hexToDigit(finalHash).forEach((e, i) => {
            tableString += `
| ${ordinaux[i]}(${a}${e})       |          |`;
        });
        return tableString + "\n";
    }

    async fileRecapFactory(finalHash: string, targetFile: TFile) {
        const recap = [];
        recap.push(this.tableFactory(finalHash));
        recap.push(finalHash);
        if (this.settings.putFileContentInRecap) {
            recap.push(await this.app.vault.read(targetFile));
        }
        return recap.join("\n\n---\n");
    }
    
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SettingsTab(this.app, this));
        this.app.workspace.on('file-menu', (menu: Menu, file: TFile | TFolder) => {
            menu.addItem((item: MenuItem) => {
                item
                    .setTitle('Hash and anteriorize')
                    .setIcon('hash')
                    .onClick(async (_evt: MouseEvent) => {
                        if (file instanceof TFile) {
                            const finalHash = await this.getFileHash(file);
                            const recap = await this.fileRecapFactory(finalHash, file);
                            let recapFolder = (this.app.vault.getAbstractFileByPath(this.settings.recapFolder)
                            ?? await this.app.vault.createFolder(this.settings.recapFolder));
                            const filePath = [recapFolder.path, `${file.name}.recap.md`].join("/");
                            let recapFile = this.app.vault.getAbstractFileByPath(filePath);
                            let nonce = -1;
                            while (recapFile) {
                                nonce++;
                                const newFilePath = [recapFolder.path, `${file.name}_${nonce}.recap.md`].join("/");
                                const newRecapFile = this.app.vault.getAbstractFileByPath(newFilePath);
                                if (!newRecapFile) {
                                    const recapFile = await this.app.vault.create(newFilePath, recap);
                                    new Notice(`Recap file created : ${recapFile.path}`);
                                    return;
                                }
                            }
                            recapFile = await this.app.vault.create(filePath, recap);
                            new Notice(`Recap file created : ${recapFile.path}`);
                        }
                        else if (file instanceof TFolder) {
                            new Notice(`Please select a single file.`);
                        }
                        else {
                            new Notice("Please select a file or a folder");
                        }
                    });
            });
        });
    }

    async loadSettings() {
        this.settings = DEFAULT_SETTINGS;
    }

    async saveSettings() {
    }


    async getFileHash(file: TFile) {
        return sha3_512(await this.app.vault.read(file));
    }

    onunload() { }
}

class SettingsTab extends PluginSettingTab {
    plugin: HAAPlugin;

    constructor(app: App, plugin: HAAPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Hash& anteriorize ready to work!' });

        containerEl.createEl("b", { text: "You're up to go! Just right click on the element (file) you want to hash and click \"press Hash and anteriorize\""});

        containerEl.createEl("div",
            { text: "Only .md files are considered.\
            The recap file created contains the URIs and everything required to reproduce the hash.\
            The recap file and the zip file are created in the root of the vault."});

        containerEl.createEl("div",
            { text: `Hash reproduction process :
            For a file, just hash the content, not the filename, path, or anything else.`});
        }
}
