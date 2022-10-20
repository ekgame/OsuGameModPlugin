/**
 * @name osu!game Mod Utils
 * @description Utilities for moderating osu!game server.
 * @version 1.5.0
 * @author ekgame
 * @authorId 90354442913742848
 * @website https://github.com/ekgame/OsuGameModPlugin
 * @source https://raw.githubusercontent.com/ekgame/OsuGameModPlugin/master/release/OsuGameMod.plugin.js
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
const config = {
    info: {
        name: "osu!game Mod Utils",
        authors: [
            {
                name: "ekgame",
                discord_id: "90354442913742848",
                github_username: "ekgame",
                twitter_username: "ekgame_"
            }
        ],
        version: "1.5.0",
        description: "Utilities for moderating osu!game server.",
        github: "https://github.com/ekgame/OsuGameModPlugin",
        github_raw: "https://raw.githubusercontent.com/ekgame/OsuGameModPlugin/master/release/OsuGameMod.plugin.js"
    },
    main: "index.js"
};
class Dummy {
    constructor() {this._config = config;}
    start() {}
    stop() {}
}
 
if (!global.ZeresPluginLibrary) {
    BdApi.showConfirmationModal("Library Missing", `The library plugin needed for ${config.name ?? config.info.name} is missing. Please click Download Now to install it.`, {
        confirmText: "Download Now",
        cancelText: "Cancel",
        onConfirm: () => {
            require("request").get("https://betterdiscord.app/gh-redirect?id=9", async (err, resp, body) => {
                if (err) return require("electron").shell.openExternal("https://betterdiscord.app/Download?id=9");
                if (resp.statusCode === 302) {
                    require("request").get(resp.headers.location, async (error, response, content) => {
                        if (error) return require("electron").shell.openExternal("https://betterdiscord.app/Download?id=9");
                        await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), content, r));
                    });
                }
                else {
                    await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, r));
                }
            });
        }
    });
}
 
module.exports = !global.ZeresPluginLibrary ? Dummy : (([Plugin, Api]) => {
     const plugin = (Plugin, Library) => {

    const { Patcher, Logger, Settings, DCM, DiscordModules, Modals, ReactTools, DOMTools, Utilities } = Library;
    const { ContextMenu } = new BdApi("OsuGameMod");

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
        }

        async onStart() {
            Logger.info(ContextMenu);
            Utilities.suppressErrors(this.patchUserContextMenu.bind(this), "UserContextMenu patch")();
        }

        onStop() {
            Patcher.unpatchAll();
        }

        async patchUserContextMenu() {
            ContextMenu.patch("user-context", (returnValue, props) => {
                if(!returnValue) {
                    return;
                }

                if (!props.guildId || !props.user || props.guildId != this.settings.guildId) {
                    return;
                }
                Logger.info(props.user);
                this.addCustomModerationMenuItems(returnValue.props.children, props.user);
            })
        }

        checkIfMuteItemExists(items) {
            return Utilities.findInReactTree(items, item => getPotentialObjectProperty(item, 'key') === 'voice-mute');
        }

        addCustomModerationMenuItems(items, user) {
            items.push(ContextMenu.buildItem({type: "separator"}));
            items.push(ContextMenu.buildItem({
                id: "warn",
                type: "text", 
                label: "Warn",
                danger: true,
                action: () => {
                    this.showWarnModal(user);
                }
            }));
            items.push(ContextMenu.buildItem({
                id: "custom-mute-and-warn",
                type: "text", 
                label: "Mute and warn",
                danger: true,
                action: () => {
                    this.showMuteAndWarnModal(user);
                }
            }));
        }

        showMuteAndWarnModal(user) {
            const userIdentifier = `${user.username}#${user.discriminator}`;

            let reason = "";
            let duration = "14d";
            let customDuration = "";

            const customDurationTextbox = new Settings.Textbox(
                "Custom duration",
                "\"5m\" - 5 minutes, \"2h\" - 2 hours, \"7d\" - 7 days, etc.", 
                customDuration, 
                (e) => customDuration = e, 
                {disabled: true}
            );

            const infractionNotes = [
                '* Excessive use of slurs means using them constantly or in very racist/offensive ways. Inoffensive and apologetic use of slurs should be handled with a verbal warning first (a slip-up should not be acted on).',
                '** Includes general toxicity, sexism, screaming etc.',
                '*** Mic spam = constantly making random noises into the mic/other annoying things that are not earrape',
            ].map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('\n');

            const element = Settings.SettingPanel.build(
                () => {},
                new Settings.Textbox("Reason", null, reason, (e) => reason = e),
                new Settings.RadioGroup("Mute Duration", '', duration, [
                    { color: "#000000", value: "999y", name: "Indefinite", desc: "Excessive use of slurs*, streaming porn/hentai/gore, anything immediatelly bannable."},
                    { color: "#ff0000", value: "14d", name: "14 Days", desc: "Excessive hostile/aggressive/toxic behavior**, slurs*."},
                    { color: "#ff7800", value: "7d", name: "7 Days", desc: "Ear rape, uncomfortably hostile/aggressive/toxic behavior**."},
                    { color: "#ffba00", value: "3d", name: "3 Days", desc: "Mic spam***, join/leave spam, acting in an exceedingly annoying way, minor infractions."},
                    { color: "#fff600", value: "1h", name: "1 Hour", desc: "Annoying amount of background noise while refusing to use Push-To-Talk or noise suppression."},
                    { color: "#aaaaaa", value: "custom", name: "Custom", desc: "Mute goes brrr."},
                ], (e) => {
                    duration = e;

                    const customDurationTextboxReact = this.getSettingReactElement(customDurationTextbox)
                    customDurationTextboxReact.props.disabled = duration != 'custom';
                    customDurationTextboxReact.forceUpdate();
                    customDurationTextbox.getElement().style.display = duration == 'custom' ? 'block' : 'none';
                    if (duration == 'custom') {
                        setTimeout(() => {
                            customDurationTextbox.getElement().querySelector('input').focus();
                        }, 100);
                    }
                }),
                DOMTools.parseHTML(`<ul style="color: var(--interactive-normal); font-size: 12px; margin-top: 20px">${infractionNotes}</ul>`),
                DOMTools.parseHTML(`<hr style="margin: 20px 0; border: thin solid var(--background-modifier-accent);"/>`),
                customDurationTextbox,
            );

            Modals.showModal(`Mute and Warn: ${userIdentifier}`, ReactTools.createWrappedElement(element), {
                cancelText: "Cancel",
                confirmText: "Mute and Warn",
                size: Modals.ModalSizes.MEDIUM,
                danger: true,
                onConfirm: () => {
                    let actualDuration = duration == 'custom' ? customDuration : duration;
                    actualDuration = actualDuration.trim();
                    if (!this.isValidDuration(actualDuration)) {
                        Modals.showAlertModal("Uh oh", "Invalid duration.");
                        throw new Error("plz dont close the modal");
                    }

                    reason = reason.trim();
                    if (!reason) {
                        Modals.showAlertModal("Uh oh", "The reason can not be empty.");
                        throw new Error("plz dont close the modal");
                    }
                    
                    this.sendMuteWarnDisconnect(user.id, reason, actualDuration);
                    Logger.info(`muting and warning: ${userIdentifier}, reason: ${reason}, duration: ${duration}`);
                }
            });

            setTimeout(() => {
                element.querySelector('input').focus();
                customDurationTextbox.getElement().style.display = 'none';
            }, 100);
        }

        showWarnModal(user) {
            const userIdentifier = `${user.username}#${user.discriminator}`;

            let reason = "";

            const element = Settings.SettingPanel.build(
                () => {},
                new Settings.Textbox("Reason", null, reason, (e) => reason = e),
            );

            Modals.showModal(`Warn: ${userIdentifier}`, ReactTools.createWrappedElement(element), {
                cancelText: "Cancel",
                confirmText: "Warn",
                size: Modals.ModalSizes.MEDIUM,
                danger: true,
                onConfirm: () => {
                    reason = reason.trim();
                    if (!reason) {
                        Modals.showAlertModal("Uh oh", "The reason can not be empty.");
                        throw new Error("plz dont close the modal");
                    }
                    
                    this.sendWarn(user.id, reason);
                    Logger.info(`warning: ${userIdentifier}, reason: ${reason}`);
                }
            });

            setTimeout(() => {
                element.querySelector('input').focus();
            }, 100);
        }

        isValidDuration(duration) {
            const regex = /^([\d]+[smhdwy]{1})+$/;
            return regex.test(duration);
        }

        getSettingReactElement(setting) {
            return ReactTools.getOwnerInstance(setting.getElement().children[0])
        }

        sendWarn(userId, reason) {
            const channel = this.getModerationChannel();
            if (!channel) {
                return;
            }
            this.sendMessage(channel.id, `!warn <@${userId}> ${reason}`);
        }

        sendMuteWarnDisconnect(userId, reason, duration) {
            const channel = this.getModerationChannel();
            if (!channel) {
                return;
            }
            this.sendMessage(channel.id, `?mute <@${userId}> ${duration} ${reason}`);
            this.sendMessage(channel.id, `!warn <@${userId}> ${reason} [vc mute ${duration}]`);
            DiscordModules.GuildActions.setChannel(this.settings.guildId, userId, null);
        }

        sendMessage(channelId, textMessage) {
            DiscordModules.MessageActions.sendMessage(channelId, {
                content: textMessage,
                invalidEmojis: [],
                tts: false,
                validNonShortcutEmojis: [],
            });
        }

        getModerationChannel() {
            return DiscordModules.ChannelStore.getChannel(this.settings.commandChannelId);
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
            );
        }
    };
};
     return plugin(Plugin, Api);
})(global.ZeresPluginLibrary.buildPlugin(config));
/*@end@*/