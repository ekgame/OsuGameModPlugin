/**
 * @name OsuGameMod
 * @invite undefined
 * @authorLink undefined
 * @donate undefined
 * @patreon undefined
 * @website undefined
 * @source undefined
 */
/*@cc_on
@if (@_jscript)
    
    // Offer to self-install for clueless users that try to run this directly.
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
    var pathSelf = WScript.ScriptFullName;
    // Put the user at ease by addressing them in the first person
    shell.Popup("It looks like you've mistakenly tried to run me directly. \n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        // Show the user where to put plugins in the future
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();

@else@*/

module.exports = (() => {
    const config = {"info":{"name":"osu!game Mod Utils","authors":[{"name":"ekgame","discord_id":"90354442913742848","github_username":"ekgame","twitter_username":"ekgame_"}],"version":"1.0.0","description":"Utilities for moderating osu!game server."},"main":"index.js"};

    return !global.ZeresPluginLibrary ? class {
        constructor() {this._config = config;}
        getName() {return config.info.name;}
        getAuthor() {return config.info.authors.map(a => a.name).join(", ");}
        getDescription() {return config.info.description;}
        getVersion() {return config.info.version;}
        load() {
            BdApi.showConfirmationModal("Library Missing", `The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`, {
                confirmText: "Download Now",
                cancelText: "Cancel",
                onConfirm: () => {
                    require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", async (error, response, body) => {
                        if (error) return require("electron").shell.openExternal("https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js");
                        await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, r));
                    });
                }
            });
        }
        start() {}
        stop() {}
    } : (([Plugin, Api]) => {
        const plugin = (Plugin, Library) => {

    const {Patcher, Settings, WebpackModules, DCM, Utilities, DiscordAPI, Modals, ReactTools} = Library;

    function isObject(item) {
        return typeof item === 'object' && item !== null;
    }

    function getPotentialObjectProperty(item, property) {
        return isObject(item) && item.hasOwnProperty(property) ? item[property] : null;
    }

    function arrayRemoveItem(array, value) { 
        const index = array.indexOf(value);
        if (index > -1) {
            array.splice(index, 1);
        }
        return array;
      }

    return class OsuGameModPlugin extends Plugin {
        constructor() {
            super();
            this.defaultSettings = {};
            this.defaultSettings.guildId = "98226572468690944";
            this.defaultSettings.commandChannelId = "158484765136125952";
            this.defaultSettings.hideStandardMute = true;
        }

        async onStart() {
            this.GuildActions = WebpackModules.getByProps("requestMembers");
            this.addGuildUserContextMenuPatch();
        }

        onStop() {
            Patcher.unpatchAll();
        }

        addGuildUserContextMenuPatch() {
            const GuildChannelUserContextMenu = WebpackModules.getModule(m => m.default && m.default.displayName == "GuildChannelUserContextMenu");
            Patcher.after(GuildChannelUserContextMenu, "default", (component, args, retVal) => {
                const { guildId, user } = args[0];
                const items = retVal.props.children.props.children;

                // The custom moderation items should only be available for the configured server 
                // and if you have the permissions to mute that user
                if (guildId !== this.settings.guildId || !this.checkIfMuteItemExists(items)) {
                    return;
                }

                this.addCustomModerationMenuItems(items, user.id);

                if (this.settings.hideStandardMute) {
                    this.removeStandardModerationItems(items);
                }
            });
        }

        checkIfMuteItemExists(items) {
            return Utilities.findInReactTree(items, item => getPotentialObjectProperty(item, 'key') === 'voice-mute');
        }

        addCustomModerationMenuItems(items, userId) {
            items.push(DCM.buildMenuItem({type: "separator"}));
            items.push(DCM.buildMenuItem({
                id: "custom-mute-and-warn",
                type: "text", 
                label: "Mute and warn",
                danger: true,
                action: () => {
                    this.showMuteAndWarnModal(userId);
                }
            }));
        }

        showMuteAndWarnModal(userId) {
            const user = DiscordAPI.User.fromId(userId);
            const userIdentifier = `${user.username}#${user.discriminator}`;

            let reason = "";
            let duration = "14d";

            const element = Settings.SettingPanel.build(
                () => {},
                new Settings.Textbox("Reason", null, reason, (e) => reason = e),
                new Settings.RadioGroup("Mute Duration", null, duration, [
                    { color: "#000000", value: "999y", name: "Indefinite", desc: "Racial slurs, streaming porn/hentai/gore, anything immediatly bannable."},
                    { color: "#FF0000", value: "14d", name: "14 Days", desc: "Ear rape, mic spam, hostile or aggressive behavior, sexism."},
                    { color: "#FF8000", value: "2d", name: "2 Days", desc: "Leave/Join spam, minor infractions."},
                    { color: "#FFFF00", value: "1h", name: "1 Hour", desc: "Excessive background noise, refusing to switch to push to talk."},
                ], (e) => duration = e),
            );

            Modals.showModal(`Mute and Warn: ${userIdentifier}`, ReactTools.createWrappedElement(element), {
                cancelText: "Cancel",
                confirmText: "Mute and Warn",
                size: Modals.ModalSizes.MEDIUM,
                danger: true,
                onConfirm: () => {
                    if (!reason.trim()) {
                        Modals.showAlertModal("Uh oh", "The reason can not be empty.");
                        return;
                    }
                    this.sendMuteWarnDisconnect(userId, reason, duration);
                    console.log(`muting and warning: ${userIdentifier}, reason: ${reason}, duration: ${duration}`);
                }
            });

            setTimeout(() => {
                element.querySelector('input').focus();
            }, 100);
        }

        sendMuteWarnDisconnect(userId, reason, duration) {
            const channel = this.getModerationChannel();
            channel.sendMessage(`?mute <@${userId}> ${duration} ${reason}`);
            channel.sendMessage(`!warn <@${userId}> ${reason} [vc mute ${duration}]`);
            this.GuildActions.setChannel(this.settings.guildId, userId, null);
        }

        removeStandardModerationItems(items) {
            const muteItem = Utilities.findInReactTree(items, item => getPotentialObjectProperty(item, 'key') === 'voice-mute');
            const deafenItem = Utilities.findInReactTree(items, item => getPotentialObjectProperty(item, 'key') === 'voice-deafen');

            for (const group of items) {
                const props = getPotentialObjectProperty(group, 'props');
                if (props && Array.isArray(props.children)) {
                    const children = props.children;
                    arrayRemoveItem(children, muteItem);
                    arrayRemoveItem(children, deafenItem);
                }
            }
        }

        getModerationChannel() {
            const channel = DiscordAPI.Channel.fromId(this.settings.commandChannelId);
            channel.assertPermissions = false;
            return channel;
        }

        getSettingsPanel() {
            return Settings.SettingPanel.build(
                this.saveSettings.bind(this),
                new Settings.Textbox(
                    "Guild ID", 
                    "The guild where this plugin is functional.", 
                    this.settings.guildId,
                    (e) => this.settings.guildId = e
                ),
                new Settings.Textbox(
                    "Command Channel ID", 
                    "The channel where moderation commands are sent.", 
                    this.settings.commandChannelId,
                    (e) => this.settings.commandChannelId = e
                ),
                new Settings.Switch(
                    "Hide standard voice chat \"Server Mute/Deafen\" toggles", 
                    "It's not recommended to use the standard toggles. If enabled, they will be hidden for the server.", 
                    this.settings.hideStandardMute,
                    (e) => this.settings.hideStandardMute = e
                ),
            );
        }
    };
};
        return plugin(Plugin, Api);
    })(global.ZeresPluginLibrary.buildPlugin(config));
})();
/*@end@*/