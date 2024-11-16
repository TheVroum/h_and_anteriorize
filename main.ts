// ascii qr code
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

import { Zip } from 'zip-lib';


enum UriType {
    None = "none",
    Address = "address",
    Uri = "uri",
    Link = "link",
}


interface HAASettings {
    recapFolder: string;
    zipFolder: string;
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
    zipFolder: "h_and_anteriorize_zips",
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

    async produceFilteredZip(folder: TFolder, recapFilePath: TFile | null) {
        if (!this.settings.createZipArchive) {
            return;
        }
        if (!recapFilePath) {
            return;
        }

        //@ts-ignore
        const basePath: string = this.app.vault.adapter.basePath;
        const children: Array<string> = [];
        Vault.recurseChildren(folder, (f: TFile | TFolder) => {
            if (f instanceof TFile && ((!this.settings.includeJustMdFiles) || f.extension === "md")) {
                children.push(f.path);
            }
        });
        const pathList = children.join("\n");
        const pathListPath = `${this.settings.zipFolder}/${folder.name}${this.settings.pathListSuffix}`;
        let pathFileNonce = -1;
        let newPathListPath = pathListPath;
        let pathListFile = this.app.vault.getAbstractFileByPath(newPathListPath);
        while (pathListFile) {
            pathFileNonce++;
            newPathListPath = `${this.settings.zipFolder}/${folder.name}_${pathFileNonce}${this.settings.pathListSuffix}`;
            pathListFile = this.app.vault.getAbstractFileByPath(newPathListPath);
        }
        pathListFile = await this.app.vault.create(newPathListPath, pathList);
        const zip = new Zip();
        children.forEach(path => zip.addFile(`${basePath}/${path}`, path));
        if (this.settings.addRecapToZip) {
            zip.addFile(`${basePath}/${recapFilePath.path}`, this.settings.zipRecapName);
        }
        zip.addFile(`${basePath}/${pathListFile.path}`, `${folder.name}${this.settings.pathListSuffix}`);
        let nonce = -1;
        let zipPath = `${this.settings.zipFolder}/${folder.name}.zip`;
        let zipFile = this.app.vault.getAbstractFileByPath(zipPath);
        while (zipFile) {
            nonce++;
            zipPath = `${this.settings.zipFolder}/${folder.name}_${nonce}.zip`;
            zipFile = this.app.vault.getAbstractFileByPath(zipPath);
        }
        await zip.archive(`${basePath}/${zipPath}`);
        await this.app.vault.delete(pathListFile);
    }

    async getFlattenedTree(folder: TFolder) {
        const children: Array<string | Array<string | Promise<string>>> = [];
        Vault.recurseChildren(folder, async (f: TFile | TFolder) => {
            if (f instanceof TFile && ((!this.settings.includeJustMdFiles) || f.extension === "md")) {
                children.push([f.path, this.getFileHash(f)]);
            }
            else {
                children.push(`${f.path} => folder`);
            }
        });
        for (let i = 0; i < children.length; i++) {
            if(children[i] instanceof Array)
            children[i] = (`${children[i][0] as string} => ${await (children[i][1] as Promise<string>)}`);
        }
        return (children as Array<string>).join("\n");
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
    
    async folderRecapFactory(finalHash: string, targetFolder: TFolder) {
        const recap = [];
        recap.push(this.tableFactory(finalHash));
        recap.push(finalHash);
        const treeWithHashes: string = await this.getFlattenedTree(targetFolder);
        recap.push(treeWithHashes);
        if (this.settings.putConcatenatedFolderContentInRecap) {
            recap.push(await this.getIndentedConcatenatedFolderContent(targetFolder));
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
                            let recapFolder = this.app.vault.getAbstractFileByPath(this.settings.recapFolder) as TFolder;
                            recapFolder = recapFolder ?? await this.app.vault.createFolder(this.settings.recapFolder);
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
                            const finalHash = await this.getHashedFlattenedTree(file);
                            const recap = await this.folderRecapFactory(finalHash, file);
                            let recapFolder = this.app.vault.getAbstractFileByPath(this.settings.recapFolder) as TFolder;
                            recapFolder = recapFolder ?? await this.app.vault.createFolder(this.settings.recapFolder);
                            const filePath = [recapFolder.path, `${file.name}.recap.md`].join("/");
                            let recapFile = this.app.vault.getAbstractFileByPath(filePath);
                            let nonce = -1;
                            while (recapFile) {
                                nonce++;
                                const newFilePath = [recapFolder.path, `${file.name}_${nonce}.recap.md`].join("/");
                                const newRecapFile = this.app.vault.getAbstractFileByPath(newFilePath);
                                if (!newRecapFile) {
                                    const recapFile = await this.app.vault.create(newFilePath, recap);
                                    await this.produceFilteredZip(file, recapFile);
                                    new Notice(`Recap file created : ${recapFile.path}`);
                                    return;
                                }
                            }
                            recapFile = await this.app.vault.create(filePath, recap);
                            await this.produceFilteredZip(file, (recapFile as TFile | null));
                            new Notice(`Recap file created : ${recapFile.path}`);
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

    async getHashedFlattenedTree(folder: TFolder) {
        return sha3_512(await this.getFlattenedTree(folder));
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

        containerEl.createEl("b", { text: "You're up to go! Just right click on the element (folder or file) you want to hash and click \"press Hash and anteriorize\""});

        containerEl.createEl("div",
            { text: "Only .md files are considered.\
            The recap file created contains the URIs and everything required to reproduce the hash.\
            The recap file and the zip file are created in the root of the vault."});

        containerEl.createEl("div",
            { text: `Hash reproduction process :
            For files, just hash the content, not the filename, path, or anything else.
            For folders, hash the flattened tree of the folder, where each line is in the form "path/to/dir => folder" or "path/to/file => 0xfilehash", without trailing line, with the sha3_512 function.`});
        }
}
