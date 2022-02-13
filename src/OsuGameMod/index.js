module.exports = (Plugin, Library) => {

    const {Patcher, Logger, Settings, WebpackModules, DCM, Utilities, DiscordModules, Modals, ReactTools} = Library;

    window.WebpackModules = WebpackModules;

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
            const REGEX = /user.*contextmenu/i;
            const filter = this.filterContext(REGEX);
            const self = this;
            const loop = async () => {
                const UserContextMenu = await DCM.getDiscordMenu(m => {
                    if (patched.has(m)) return false;
                    if (m.displayName != null) return REGEX.test(m.displayName);
                    return filter(m);
                });

                if (self.promises.cancelled) return;
                
                if (!UserContextMenu.default.displayName) {
                    let original = null;
                    function wrapper(props) {
                        const rendered = original.call(self, props);
  
                        try {
                            const childs = Utilities.findInReactTree(rendered, Array.isArray);
                            const user = props.user || UserStore.getUser(props.channel?.getRecipientId?.());
                            if (!childs || !user || childs.some(c => c && c.key === "copy-user")) return rendered;
                            const guildId = props.guildId || null;
                            if (guildId === self.settings.guildId) {
                                self.addCustomModerationMenuItems(childs, user.id);
                            }
                        } catch (error) {
                            cancel();
                            Logger.error("Error in context menu patch:", error);
                        }
  
                        return rendered;
                    }
  
                    const cancel = Patcher.after(UserContextMenu, "default", (...args) => {
                        const [, , ret] = args;
                        const contextMenu = Utilities.getNestedProp(ret, "props.children");
                        if (!contextMenu || typeof contextMenu.type !== "function") return;
  
                        original ??= contextMenu.type;
                        wrapper.displayName ??= original.displayName;
                        contextMenu.type = wrapper;
                    });
                }

                patched.add(UserContextMenu.default);
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