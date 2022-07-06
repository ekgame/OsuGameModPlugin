/**
 * @name OsuGameMod
 * @invite undefined
 * @authorLink undefined
 * @donate undefined
 * @patreon undefined
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

module.exports = (() => {
    const config = {"info":{"name":"osu!game Mod Utils","authors":[{"name":"ekgame","discord_id":"90354442913742848","github_username":"ekgame","twitter_username":"ekgame_"}],"version":"1.3.0","description":"Utilities for moderating osu!game server.","github":"https://github.com/ekgame/OsuGameModPlugin","github_raw":"https://raw.githubusercontent.com/ekgame/OsuGameModPlugin/master/release/OsuGameMod.plugin.js"},"main":"index.js"};

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

    const {Patcher, Logger, Settings, WebpackModules, DCM, DiscordModules, Modals, ReactTools} = Library;

    window.WebpackModules = WebpackModules;
    const flush = new Set;

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

    class Utilities extends Library.Utilities {
        static combine(...filters) {
            return (...args) => filters.every(filter => filter(...args));
        }
    }

    class ContextMenu {
        static buildItem(item) {
            if (item.children) {
                if (Array.isArray(item.children)) item.children = this.buildItems(item.children);
                else item.children = this.buildItem(item.children);
            }

            const id = (item.id ? item.id : item.label.toLowerCase().replace(/ /g, "-"))
                + (item.children ? "" : "-submenu");

            return React.createElement(MenuItem, {
                ...item,
                id: id,
                key: id
            });
        }

        static buildItems(items) {
            return items.map(e => this.buildItem(e));
        }

        static buildMenu(items) {
            return React.createElement(
                MenuGroup,
                {key: items[0].id},
                this.buildItems(items)
            );
        }

        static open(target, render) {return ContextMenuActions.openContextMenu(target, render);}

        static close() {return ContextMenuActions.closeContextMenu();}

        static async findContextMenu(displayName, filter = _ => true) {
            const regex = new RegExp(displayName, "i");
            const normalFilter = (exports) => exports && exports.default && regex.test(exports.default.displayName) && filter(exports.default);
            const nestedFilter = (module) => regex.test(module.toString());

            {
                const normalCache = WebpackModules.getModule(Utilities.combine(normalFilter, (e) => filter(e.default)));
                if (normalCache) return {type: "normal", module: normalCache};
            }

            {
                const webpackId = Object.keys(WebpackModules.require.m).find(id => nestedFilter(WebpackModules.require.m[id]));
                const nestedCache = webpackId !== undefined && WebpackModules.getByIndex(webpackId);
                if (nestedCache && filter(nestedCache?.default)) return {type: "nested", module: nestedCache};
            }

            return new Promise((resolve) => {
                const cancel = () => WebpackModules.removeListener(listener);
                const listener = (exports, module) => {
                    const normal = normalFilter(exports);
                    const nested = nestedFilter(module);

                    if ((!nested && !normal) || !filter(exports?.default)) return;

                    resolve({type: normal ? "normal" : "nested", module: exports});
                    WebpackModules.removeListener(listener);
                    flush.delete(cancel);
                };

                WebpackModules.addListener(listener);
                flush.add(cancel);
            });
        }
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
            this.promises = {state: {cancelled: false}, cancel() {this.state.cancelled = true;}};
            Utilities.suppressErrors(this.patchUserContextMenu.bind(this), "UserContextMenu patch")();
        }

        onStop() {
            this.promises.cancel();
            Patcher.unpatchAll();
        }

        filterContext(name) {
            const shouldInclude = ["page", "section", "objectType"];
            const notInclude = ["use", "root"];
            const isRegex = name instanceof RegExp;

            return (module) => {
                const string = module.toString({});
                const getDisplayName = () => Utilities.getNestedProp(module({}), "props.children.type.displayName");

                return !~string.indexOf("return function")
                    && shouldInclude.every(s => ~string.indexOf(s))
                    && !notInclude.every(s => ~string.indexOf(s))
                    && (isRegex ? name.test(getDisplayName()) : name === getDisplayName())
            }
        }

        async patchUserContextMenu() {
            // No idea how any of this works, but it somehow patches the right click menu.
            // Stole it from the "Copier" plugin: https://github.com/Strencher/BetterDiscordStuff/tree/master/Copier
            // Can't wait for it to break again.

            const patched = new WeakSet();
            const Regex = /displayName="\S+?usercontextmenu./i;
            const originalSymbol = Symbol("Copier Original");
            const self = this;
            const loop = async () => {
                console.log("starting loop");
                const UserContextMenu = await ContextMenu.findContextMenu(Regex, m => !patched.has(m));
                console.log(UserContextMenu);

                if (this.promises.cancelled) return;
                console.log("promise not canceled");

                const patch = (rendered, props) => {
                    const childs = Utilities.findInReactTree(rendered, Array.isArray);
                    const user = props.user || UserStore.getUser(props.channel?.getRecipientId?.());
                    if (!childs || !user || childs.some(c => c && c.key === "custom-mute-and-warn")) return rendered;
                    console.log("adding to context menu (1)");
                    console.log(childs);
                    console.log(user);
                    self.addCustomModerationMenuItems(childs, user.id);
                };

                function CopierDeepWrapperForDiscordsCoolAnalyticsWrappers(props) {
                    const rendered = props[originalSymbol].call(this, props);

                    try {
                        patch(rendered, props);
                    } catch (error) {
                        Logger.error("Error in context menu patch:", error);
                    }

                    return rendered;
                }

                let original = null;
                function CopierContextMenuWrapper(props, _, rendered) {
                    rendered ??= original.call(this, props);

                    try {
                        if (rendered?.props?.children?.type?.displayName.indexOf("ContextMenu") > 0) {
                            const child = rendered.props.children;
                            child.props[originalSymbol] = child.type;
                            CopierDeepWrapperForDiscordsCoolAnalyticsWrappers.displayName = child.type.displayName;
                            child.type = CopierDeepWrapperForDiscordsCoolAnalyticsWrappers;
                            return rendered;
                        }

                        patch(rendered, props);
                    } catch (error) {
                        cancel();
                        Logger.error("Error in context menu patch:", error);
                    }

                    return rendered;
                }

                Patcher.after(UserContextMenu.module, "default", (_, [props], ret) => {
                    debugger;
                    console.log("running patcher");
                    console.log(arguments);
                    if (UserContextMenu.type === "normal") {
                        const children = Utilities.findInReactTree(ret, Array.isArray)
                        if (!Array.isArray(children)) return;
        
                        const {user} = props;
                        console.log("adding to context menu (2)");
                        console.log(children);
                        console.log(user);
                        self.addCustomModerationMenuItems(children, user.id);
                    } else {
                        const contextMenu = Utilities.getNestedProp(ret, "props.children");
                        if (!contextMenu || typeof contextMenu.type !== "function") return;

                        original ??= contextMenu.type;
                        CopierContextMenuWrapper.displayName ??= original.displayName;
                        contextMenu.type = CopierContextMenuWrapper;
                    }
                });

                console.log("Adding patch");
                patched.add(UserContextMenu.module.default);
                console.log("Added patch");
                loop();
            };

            loop();
        }

        checkIfMuteItemExists(items) {
            return Utilities.findInReactTree(items, item => getPotentialObjectProperty(item, 'key') === 'voice-mute');
        }

        addCustomModerationMenuItems(items, userId) {
            if (this.settings.hideStandardMute) {
                this.removeStandardModerationItems(items);
            }
            items.push(DCM.buildMenuItem({type: "separator"}));
            items.push(DCM.buildMenuItem({
                id: "warn",
                type: "text", 
                label: "Warn",
                danger: true,
                action: () => {
                    this.showWarnModal(userId);
                }
            }));
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
            const user = DiscordModules.UserStore.getUser(userId);
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

            const element = Settings.SettingPanel.build(
                () => {},
                new Settings.Textbox("Reason", null, reason, (e) => reason = e),
                new Settings.RadioGroup("Mute Duration", "", duration, [
                    { color: "#000000", value: "999y", name: "Indefinite", desc: "Racial slurs, streaming porn/hentai/gore, anything immediatly bannable."},
                    { color: "#FF0000", value: "14d", name: "14 Days", desc: "Ear rape, mic spam, hostile or aggressive behavior, sexism."},
                    { color: "#FF8000", value: "2d", name: "2 Days", desc: "Leave/Join spam, minor infractions."},
                    { color: "#FFFF00", value: "1h", name: "1 Hour", desc: "Excessive background noise, refusing to switch to push to talk."},
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
                    
                    this.sendMuteWarnDisconnect(userId, reason, actualDuration);
                    console.log(`muting and warning: ${userIdentifier}, reason: ${reason}, duration: ${duration}`);
                }
            });

            setTimeout(() => {
                element.querySelector('input').focus();
                customDurationTextbox.getElement().style.display = 'none';
            }, 100);
        }

        showWarnModal(userId) {
            const user = DiscordModules.UserStore.getUser(userId);
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
                    
                    this.sendWarn(userId, reason);
                    console.log(`warning: ${userIdentifier}, reason: ${reason}`);
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