module.exports = (Plugin, Library) => {

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
                if (guildId !== this.settings.guildId) {
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
            const user = DiscordAPI.User.fromId(userId);
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
                new Settings.RadioGroup("Mute Duration", "Example", duration, [
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
                        return false;
                    }

                    reason = reason.trim();
                    if (!reason) {
                        Modals.showAlertModal("Uh oh", "The reason can not be empty.");
                        return false;
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
            const user = DiscordAPI.User.fromId(userId);
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
                        return true;
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
            channel.sendMessage(`!warn <@${userId}> ${reason}`);
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