/**
 * @param {import("zerespluginlibrary").Plugin} Plugin 
 * @param {import("zerespluginlibrary").BoundAPI} Library 
 * @returns 
 */
module.exports = (Plugin, Library) => {

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