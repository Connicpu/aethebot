/**
 * Looks for times in chat and helps with timezones.
 */

/*
 * AetheBot - A Discord Chatbot
 *
 * Created by Tyrone Trevorrow on 03/02/17.
 * Copyright (c) 2017 Tyrone Trevorrow. All rights reserved.
 *
 * This source code is licensed under the permissive MIT license.
 */

import * as Chrono from "chrono-node"
import * as Discord from "discord.js"
import * as Moment from "moment-timezone"
import { log } from "../log"
import { Feature } from "./feature"

const MAXIMUM_TIMEZONES = 4
Moment.locale("en")

export class TimehelperFeature extends Feature {

    public handleMessage(message: Discord.Message): boolean {
        // This is likely a command
        if (!this.handleCommand(message)) {
            // Command handler failed, treat it as an ambient
            this.handleAmbientMessage(message)
            return false
        }

        // Do nothing if not mentioned
        return false
    }

    public async handleAmbientMessage(message: Discord.Message): Promise<boolean> {
        // Remove the mentions
        const tokens = this.commandTokens(message)
        const mentionRegex = /\<\@\d+\>/g
        const noMentions = tokens.filter((token) => !mentionRegex.test(token))
        const cleanMsg = noMentions.join(" ")
        const timezone = await this.timezoneForUser(message.author.id)
        if (!timezone || !Moment.tz.zone(timezone)) {
            return false
        }
        const zoneinfo = Moment.tz.zone(timezone)
        if (!zoneinfo) {
            return false
        }
        const zoneoffset = zoneinfo.offset(Number(new Date())) * -1
        const outZones = (await this.userTimezones()).map((z) => z.toLowerCase())
        // Filter out the messager's timezone
        outZones.splice(outZones.indexOf(timezone.toLowerCase()), 1)
        if (outZones.length === 0) {
            // No timezones to translate to
            return false
        }
        const results = Chrono.parse(cleanMsg, Moment().tz(timezone))
        if (!results || results.length === 0) {
            return false
        }
        const format = "MMM Do ha z"
        const embed = new Discord.RichEmbed()
        embed.setColor("#FF5200")
        for (const result of results) {
            if (!result.start.knownValues.hour) {
                // If we're not given an hour, it's not precise enough to bother
                // everyone in the server.
                continue
            }
            if (!result.start.get("timezoneOffset")) {
                result.start.assign("timezoneOffset", zoneoffset)
            }
            const date = result.start.date()
            const zonesStrs = outZones.map((z) => Moment(date).tz(z).format(format))
            const zonesStr = Array.from(new Set(zonesStrs)).join(", ")
            embed.addField(`${Moment(date).tz(timezone).format(format)}`, `${zonesStr}`)
            if (results.length === 1) {
                embed.setFooter("In your timezone: ")
                embed.setTimestamp(date)
            }
        }
        if (embed.fields && embed.fields.length > 0) {
            message.channel.sendEmbed(embed)
        }
        return false
    }

    public handleCommand(message: Discord.Message): boolean {
        const tokens = this.commandTokens(message)
        if (tokens.length >= 1 &&
            tokens[0].toLowerCase() === "timezone") {
            if (tokens.length === 1) {
                // Just "timezone" on its own
                this.timezoneForUser(message.author.id).then((zone) => {
                    this.replyWith(message, "Your timezone is set to " + zone)
                })
                return true
            }
            const timezone = tokens[1]
            const removeKeywords = [
                "remove", "delete", "delet", "nil", "null", "none",
            ]
            if (removeKeywords.indexOf(timezone.toLowerCase()) !== -1) {
                this.removeTimezoneForUser(message.author)
                this.replyWith(message, "ok")
                return true
            }
            if (!Moment.tz.zone(timezone)) {
                this.replyWith(message, "I don't recognise that timezone")
                return true
            }
            this.setTimezoneForUser(timezone, message.author.id)
            this.replyWith(message, "ok")
            return true
        } else {
            return false
        }
    }

    protected timezoneForUser(userId: string): Promise<string | null> {
        const key = `th:tz:${userId}`
        return this.bot.brain.get(key)
    }

    protected setTimezoneForUser(timezone: string, userId: string) {
        const key = `th:tz:${userId}`
        this.bot.brain.set(key, timezone)
        this.updateTimezonedUsers(userId, false)
    }

    protected removeTimezoneForUser(user: Discord.User) {
        const key = `th:tz:${user.id}`
        this.bot.brain.remove(key)
        this.updateTimezonedUsers(user.id, true)
    }

    /** Async as fuck -- it could potentially take a really long time to
     * return. You better hope the brain is really fast.
     */
    protected async userTimezones(): Promise<string[]> {
        const key = "th:tzusers"
        const zones: string[] = []
        const userIdsStr = await this.bot.brain.get(key)
        if (!userIdsStr) {
            return zones
        }
        const userIds = userIdsStr.split(",").filter((x) => !!x)
        for (const userId of userIds) {
            const zone = await this.timezoneForUser(userId)
            if (zone) {
                zones.push(zone)
            }
        }
        zones.slice(0, MAXIMUM_TIMEZONES)
        return zones
    }

    protected async updateTimezonedUsers(updatedUserId: string, removed: boolean) {
        const key = "th:tzusers"
        const userIdsStr = await this.bot.brain.get(key)
        if (!userIdsStr && !removed) {
            this.bot.brain.set(key, updatedUserId)
            return
        }
        if (!userIdsStr) {
            // Trying to remove a user from an empty list... how about we just bail
            return
        }
        const userIds = userIdsStr.split(",").filter((x) => !!x)
        if (removed) {
            userIds.splice(userIds.indexOf(updatedUserId), 1)
            this.bot.brain.set(key, userIds.join(","))
        } else {
            if (userIds.indexOf(updatedUserId) !== -1) {
                return
            }
            userIds.push(updatedUserId)
            this.bot.brain.set(key, userIds.join(","))
        }
    }
}
