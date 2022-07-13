module.exports = (Plugin, Library) => {

    const {Patcher, Logger, Settings, WebpackModules, DCM, DiscordModules, Modals, ReactTools, DOMTools} = Library;

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
                const UserContextMenu = await ContextMenu.findContextMenu(Regex, m => !patched.has(m));

                if (this.promises.cancelled) return;

                const patch = (rendered, props) => {
                    const childs = Utilities.findInReactTree(rendered, Array.isArray);
                    const user = props.user || UserStore.getUser(props.channel?.getRecipientId?.());
                    if (!childs || !user || childs.some(c => c && c.key === "custom-mute-and-warn")) return rendered;
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
                    if (UserContextMenu.type === "normal") {
                        const children = Utilities.findInReactTree(ret, Array.isArray)
                        if (!Array.isArray(children)) return;
        
                        const {user} = props;
                        self.addCustomModerationMenuItems(children, user.id);
                    } else {
                        const contextMenu = Utilities.getNestedProp(ret, "props.children");
                        if (!contextMenu || typeof contextMenu.type !== "function") return;

                        original ??= contextMenu.type;
                        CopierContextMenuWrapper.displayName ??= original.displayName;
                        contextMenu.type = CopierContextMenuWrapper;
                    }
                });

                patched.add(UserContextMenu.module.default);
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
                DOMTools.parseHTML(`<ul style="color: var(--interactive-normal); font-size: 12px;">${infractionNotes}</ul>`),
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