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

const { Plugin } = require('powercord/entities');
const { React, getModule, getModuleByDisplayName } = require('powercord/webpack');
const { inject, uninject } = require('powercord/injector');
const { getOwnerInstance, waitFor } = require('powercord/util');
const { Icons: { FontAwesome } } = require('powercord/components');
const { resolve } = require('path');

const QDanceClient = require('./qdance-client');

module.exports = class QDanceRadio extends Plugin {
  constructor () {
    super();
    this.qdanceClient = new QDanceClient();
  }

  async startPlugin () {
    this.loadCSS(resolve(__dirname, 'style.scss'));
    this.classes = await getModule([ 'container', 'usernameContainer' ]);
    const instance = getOwnerInstance(await waitFor(`.${this.classes.container}:not(.powercord-spotify)`));

    await inject('qdance-radio-controls', instance.__proto__, 'render', (_, res) => {
      let og = res; // @TODO: Better Spotify integration
      if (Array.isArray(res)) {
        // eslint-disable-next-line prefer-destructuring
        og = res[1];
      }
      return [
        this.renderFromOriginal(og),
        res
      ];
    });

    instance.forceUpdate();
    this._forceUpdate = () => instance.forceUpdate();
    this._adCallback = duration => {
      const header = document.querySelector('.qdance-radio-header');
      header.classList.add('ad');
      setTimeout(() => header.classList.remove('ad'), duration * 1000);
    };
    // @TODO: When Powercord can do that on stable branch emit RPC event
    this.qdanceClient.on('playing', this._forceUpdate);
    this.qdanceClient.on('paused', this._forceUpdate);
    this.qdanceClient.on('trackChange', this._forceUpdate);
    this.qdanceClient.on('advertisement', this._adCallback);
  }

  pluginWillUnload () {
    uninject('qdance-radio-controls');
    this.qdanceClient.off('playing', this._forceUpdate);
    this.qdanceClient.off('paused', this._forceUpdate);
    this.qdanceClient.off('trackChange', this._forceUpdate);
    this.qdanceClient.off('advertisement', this._adCallback);
    this.qdanceClient.shutdown();
  }

  renderFromOriginal (res) {
    if (!this.qdanceClient.track) {
      return null;
    }

    const MediaBar = getModuleByDisplayName('MediaBar', false);
    const nameComponent = res.props.children[1].props.children({});
    [ nameComponent.props.className ] = nameComponent.props.className.split(' ');
    nameComponent.props.children[0].props.className = 'qdance-radio-title';
    nameComponent.props.children[1].props.className = 'qdance-radio-artist';
    nameComponent.props.children[0].props.children.props.children = this.qdanceClient.track.title;
    nameComponent.props.children[1].props.children = this.qdanceClient.track.artist;
    delete nameComponent.props.onMouseEnter;
    delete nameComponent.props.onClick;

    const playPause = this.qdanceClient.playing
      ? this.renderButton(res, 'Pause', 'pause', () => this.qdanceClient.pause())
      : this.renderButton(res, 'Play', 'play', () => this.qdanceClient.play());

    const volumeButton = playPause.type(playPause.props).props.children({});
    volumeButton.props.children = React.createElement(FontAwesome, { icon: 'volume-up' });
    delete volumeButton.props.onClick;

    return React.createElement('div', { className: 'qdance-radio' }, [
      React.createElement('div', { className: 'qdance-radio-header' }, 'Q-Dance Radio'),
      {
        ...res,
        props: {
          ...res.props,
          onMouseEnter: () => void 0,
          onMouseLeave: () => void 0,
          className: `${res.props.className || ''} qdance-radio-controls`.trim(),
          children: [
            React.createElement('div', { className: this.classes.avatarWrapper },
              React.createElement('img', {
                src: this.qdanceClient.track.cover,
                alt: 'Q-Dance now playing cover',
                className: `${this.classes.avatar} qdance-radio-cover`,
                style: {
                  width: 32,
                  height: 32
                }
              })
            ),
            nameComponent,
            {
              ...res.props.children[2],
              props: {
                ...res.props.children[2].props,
                className: `${res.props.children[2].props.className || ''} qdance-radio-buttons`.trim(),
                children: [
                  React.createElement('div', {
                    className: 'volume',
                    onClick: e => e.stopPropagation(),
                    onMouseEnter: () => {
                      if (this._timeout) {
                        clearInterval(this._timeout);
                      }
                      document.querySelector('.mediaBarProgress-1xaPtl').style.width = `${this.qdanceClient.volume * 100}%`;
                      document.querySelector('.qdance-radio-buttons').classList.add('volume-show');
                    },
                    onMouseLeave: () => {
                      this._timeout = setTimeout(() => {
                        document.querySelector('.qdance-radio-buttons').classList.remove('volume-show');
                      }, 500);
                    }
                  }, [
                    volumeButton,
                    React.createElement(MediaBar, {
                      onDrag: v => {
                        this.qdanceClient.setVolume(v);
                        document.querySelector('.mediaBarProgress-1xaPtl').style.width = `${v * 100}%`;
                      },
                      onDragEnd: () => {
                        this._timeout = setTimeout(() => {
                          document.querySelector('.qdance-radio-buttons').classList.remove('volume-show');
                        }, 500);
                      },
                      onDragStart: () => {
                        if (this._timeout) {
                          clearInterval(this._timeout);
                        }
                      },
                      type: 'VOLUME',
                      value: 0,
                      currentWindow: window
                    })
                  ]),
                  playPause
                ]
              }
            }
          ]
        }
      }
    ]);
  }

  renderButton (res, tooltipText, icon, onClick) {
    return {
      ...res.props.children[2].props.children[0],
      props: {
        ...res.props.children[2].props.children[0].props,
        icon: () => React.createElement(FontAwesome, { icon }),
        tooltipText,
        onClick
      }
    };
  }
};
