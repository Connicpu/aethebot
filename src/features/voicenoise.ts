/**
 * Basically the Airhorn Solutions feature.
 */

/*
 * AetheBot - A Discord Chatbot
 * 
 * Created by Tyrone Trevorrow on 11/03/17.
 * Copyright (c) 2017 Tyrone Trevorrow. All rights reserved.
 * 
 * This source code is licensed under the permissive MIT license.
 */

import {Feature} from "./feature"
import * as Discord from "discord.js"
import * as Path from "path"

function _pathForNoiseFile(noiseFile: string) {
    return Path.join(process.cwd(), "res", noiseFile)
}

interface Noise {
    id: string,
    file: string,
    keywords: string[]
}

const NOISES: Noise[] = [
    {
        "id": "OSTRICH",
        "file": _pathForNoiseFile("ostrich.mp3"),
        "keywords": ["haha", "ostrich", "haha!"]
    }
]

enum VoicePlaybackStatus {
    Waiting,
    Connecting,
    Playing,
    Finished
}

interface VoicePlaybackIntent {
    noise: Noise
    channel: Discord.VoiceChannel
    state: VoicePlaybackStatus
    connection?: Discord.VoiceConnection
}

export class VoiceNoiseFeature extends Feature {
    pendingPlayback: {[chanId: string]: VoicePlaybackIntent[]} = {}

    handleMessage(message: Discord.Message): boolean {
        if (message.author.equals(this.bot.user)) {
            return false
        }

        if (!message.isMentioned(this.bot.user) ||
            message.mentions.users.size !== 1) {
            return false
        }

        const tokens = this.commandTokens(message)
        if (tokens.length !== 1) {
            return false
        }
        const noise = this._noiseForToken(tokens[0])
        if (!noise) {
            return false
        }
        const serverChannels = message.guild.channels
        const authorVoiceChannels = serverChannels
            .filter((chan: Discord.GuildChannel) => {
                if (chan.type === "voice") {
                    const vchan = chan as any as Discord.VoiceChannel
                    if (vchan.members.get(message.author.id)) {
                        return true
                    } else {
                        return false
                    }
                }
            })

        if (authorVoiceChannels.array().length === 0) {
            return false
        }
        const channel: Discord.VoiceChannel = authorVoiceChannels.first() as any

        this._pushPlaybackIntent(channel, {
            noise: noise,
            channel: channel,
            state: VoicePlaybackStatus.Waiting
        })
        return true
    }

    _noiseForToken(token: string): Noise {
        for (let noise of NOISES) { 
            if (noise.keywords.find((x) => x === token)) {
                return noise
            }
        }
        return null
    }

    _pushPlaybackIntent(channel: Discord.VoiceChannel, 
        intent: VoicePlaybackIntent) {
        let playQueue = this.pendingPlayback[channel.id]
        if (!playQueue) {
            playQueue = []
            this.pendingPlayback[channel.id] = playQueue
        }
        playQueue.push(intent)
        this._updatePlaybackQueue(channel.id)
    }

    _updateAllPlaybackQueues() {
        for (let chanId in this.pendingPlayback) {
            const queue = this.pendingPlayback[chanId]
            if (queue.length === 0) {
                continue
            } else {
                this._updatePlaybackQueue(chanId)
            }
        }
    }

    _updatePlaybackQueue(chanId: string) {
        const queue = this.pendingPlayback[chanId]
        const top = queue[0]
        if (top.state === VoicePlaybackStatus.Waiting) {
            if (!top.channel.connection) {
                top.state = VoicePlaybackStatus.Connecting
                top.channel.join().then(conn => {
                    top.connection = conn
                    this._updatePlaybackQueue(chanId)
                }).catch(console.error)
            } else {
                top.connection = top.channel.connection
                top.state = VoicePlaybackStatus.Connecting
                this._updatePlaybackQueue(chanId)
            }
        } else if (top.state === VoicePlaybackStatus.Connecting) {
            if (top.connection) {
                console.log(`${(new Date()).getTime()}: playback started`)
                const d = top.connection.playFile(top.noise.file)
                d.on("end", () => {
                    console.log(`${(new Date()).getTime()}: playback finished`)
                    top.state = VoicePlaybackStatus.Finished
                    this._updatePlaybackQueue(chanId)
                })
            }
        } else if (top.state === VoicePlaybackStatus.Playing) {
            // Ignore it, it's still playing
        } else if (top.state === VoicePlaybackStatus.Finished) {
            // Pop from the top
            queue.shift()
            if (queue.length === 0) {
                top.channel.leave()
            } else {
                this._updatePlaybackQueue(chanId)
            }
        }
    }
}
