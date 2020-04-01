/*
 * Copyright (c) 2020 Bowser65, All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const EventEmitter = require('events');
const { get } = require('powercord/http');

class QDanceClient extends EventEmitter {
  constructor () {
    super();
    this._poll();
    this.playing = false;
    this.serverMetadata = null;
    this.track = null;
    this.volume = 1;
  }

  async play () {
    clearInterval(this.interval);
    if (!this.serverMetadata) {
      this.serverMetadata = await this._getStreamEndpoints();
    }

    this.playing = true;
    this.sessionId = this._v4();
    this.audio = new Audio(`${this.serverMetadata.server}/${this.serverMetadata.mountPoint}.mp3?sbmid=${this.sessionId}`);
    this.audio.volume = this.volume;
    this.emit('playing');
    const subscibe = () => {
      this.audio.removeEventListener('play', subscibe);
      this.eventSource = new EventSource(`${this.serverMetadata.server}/${this.serverMetadata.mountPoint}_SBM?sbmid=${this.sessionId}`);
      this.eventSource.addEventListener('message', async msg => {
        const data = JSON.parse(msg.data);
        const coverPromise = this._getCover();
        console.log(data);
        setTimeout(async () => {
          if (data.name === 'track') {
            this._nowPlaying({
              Title: data.parameters.cue_title,
              Artist: data.parameters.track_artist_name,
              CoverImage: await coverPromise
            });
          } else if (data.name === 'ad' && data.parameters.ad_type === 'endbreak') {
            this.emit('advertisement', parseInt(data.parameters.cue_time_duration.split(':').pop()) + 1);
          }
        }, data.timestamp === 0 ? 0 : Date.now() - parseInt(data.parameters.cue_time_start) + 3000);
        console.log(msg);
      });
    };
    this.audio.addEventListener('play', subscibe);
    this.audio.play();
  }

  pause () {
    this.emit('paused');
    this.audio.pause();
    this.eventSource.close();
    delete this.audio;
    delete this.eventSource;
    this.playing = false;
    this._poll();
  }

  setVolume (volume) {
    this.volume = volume;
    if (this.audio) {
      this.audio.volume = volume;
    }
  }

  shutdown () {
    clearInterval(this.interval);
    if (this.audio) {
      this.audio.pause();
      delete this.audio;
    }
    if (this.eventSource) {
      this.eventSource.close();
      delete this.eventSource;
    }
    this.emit('shutdown');
  }

  _poll () {
    this.interval = setInterval(async () => {
      const response = await get(QDanceClient.NOW_PLAYING_ENDPOINT);
      if (response.ok) {
        this._nowPlaying(response.body.TrackData.NowPlaying);
      }
    }, 2000);
  }

  async _getCover () {
    const response = await get(QDanceClient.NOW_PLAYING_ENDPOINT);
    if (response.ok) {
      return response.body.TrackData.NowPlaying.CoverImage;
    }
    return null;
  }

  async _getStreamEndpoints () {
    const response = await get(QDanceClient.LIVESTREAM_METADATA);
    if (response.ok) {
      const xml = response.body.toString('utf-8');
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const mountPoint = doc.querySelector('mount').textContent;
      const server = `https://${doc.querySelector('servers ip').textContent}`;
      return {
        server,
        mountPoint
      };
    }
    return null;
  }

  _nowPlaying (track) {
    if (!this.track || this.track.artist !== track.Artist || this.track.title !== track.Title) {
      this.track = {
        title: track.Title,
        artist: track.Artist,
        cover: track.CoverImage
      };
      this.emit('trackChange', this.track);
    }
  }

  _v4 () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }
}

QDanceClient.NOW_PLAYING_ENDPOINT = 'https://feed.q-dance.com/onair';
QDanceClient.LIVESTREAM_METADATA = 'https://playerservices.streamtheworld.com/api/livestream?mount=Q_DANCE&transports=http%2Chls%2Chlsts&version=1.9';
module.exports = QDanceClient;
