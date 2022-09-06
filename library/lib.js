let fs = require('fs')
const { proto, delay, getContentType } = require('@adiwajshing/baileys')
const axios = require('axios').default
const moment = require('moment-timezone')
const { sizeFormatter } = require('human-readable')
const cheerio = require('cheerio')
const isUrl = require('is-url')

const byteToSize = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const size = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + size[i]
}

const formatp = sizeFormatter({
    std: 'JEDEC', //'SI' = default | 'IEC' | 'JEDEC'
    decimalPlaces: 2,
    keepTrailingZeroes: false,
    render: (literal, symbol) => `${literal} ${symbol}B`,
})

    const getBuffer = async(url, options) => {
        try {
            options ? options : {}
            const anu = await axios({
                url,
                method: 'GET',
                headers: {
                    'DNT': 1,
                    'Upgrade-Insecure-Request': 1
                },
                ...options,
                responseType: 'arraybuffer'
            })
            return anu.data
        } catch (err) {
            return err
        }
    }

    const fetchJson = async(url, options) => {
        try {
            options ? options : {}
            const anu = await axios({
                url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
                },
                ...options
            })
            return anu.data
        } catch (err) {
            return err
        }
    }

    const urlDirect = async(url) => {
      try {
        return await fetchJson('https://anubis.6te.net/api/getredirect.php?url=' + url)
      } catch (err) {
        console.log(err)
      }
    }

    const getSizeMedia = async(path) => {
        return new Promise((resolve, reject) => {
            if (/http/.test(path)) {
                axios({url: path, method: 'GET'})
                .then((res) => {
                    let length = parseInt(res.headers['content-length'])
                    let size = byteToSize(length, 3)
                    if (!isNaN(length)) resolve(size)
                })
            } else if (Buffer.isBuffer(path)) {
                let length = Buffer.byteLength(path)
                let size = byteToSize(length, 3)
                if (!isNaN(length)) resolve(size)
            } else {
                reject('error ngab!')
            }
        })
    }
    /**
     * Serialize Message
     * @param {WAanubisection} anubis 
     * @param {Object} m 
     * @param {store} store 
     */
    const smsg = (anubis, m, store) => {
        if (!m) return m
        let M = proto.WebMessageInfo
        if (m.key) {
            m.id = m.key.id
            m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
            m.chat = m.key.remoteJid
            m.fromMe = m.key.fromMe
            m.isGroup = m.chat.endsWith('@g.us')
            m.sender = anubis.decodeJid(m.fromMe && anubis.user.id || m.participant || m.key.participant || m.chat || '')
            if (m.isGroup) m.participant = anubis.decodeJid(m.key.participant) || ''
        }
        if (m.message) {
            m.mtype = getContentType(m.message)
            m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.mtype])
            m.body = m.message.conversation || m.msg.caption || m.msg.text || (m.mtype == 'listResponseMessage') && m.msg.singleSelectReply.selectedRowId || (m.mtype == 'buttonsResponseMessage') && m.msg.selectedButtonId || (m.mtype == 'viewOnceMessage') && m.msg.caption || m.text
            let quoted = m.quoted = m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null
            m.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
            if (m.quoted) {
                let type = Object.keys(m.quoted)[0]
                m.quoted = m.quoted[type]
                if (['productMessage'].includes(type)) {
                    type = Object.keys(m.quoted)[0]
                    m.quoted = m.quoted[type]
                }
                if (typeof m.quoted === 'string') m.quoted = {
                    text: m.quoted
                }
                m.quoted.mtype = type
                m.quoted.id = m.msg.contextInfo.stanzaId
                m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
                m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
                m.quoted.sender = anubis.decodeJid(m.msg.contextInfo.participant)
                m.quoted.fromMe = m.quoted.sender === anubis.decodeJid(anubis.user.id)
                m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
                m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
                m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return false
                let q = await store.loadMessage(m.chat, m.quoted.id)
                 return module.exports.smsg(anubis, q, store)
                }
                let vM = m.quoted.fakeObj = M.fromObject({
                    key: {
                        remoteJid: m.quoted.chat,
                        fromMe: m.quoted.fromMe,
                        id: m.quoted.id
                    },
                    message: quoted,
                    ...(m.isGroup ? { participant: m.quoted.sender } : {})
                })
    
                /**
                 * 
                 * @returns 
                 */
                m.quoted.delete = () => anubis.sendMessage(m.quoted.chat, { delete: vM.key })
    
           /**
            * 
            * @param {*} jid 
            * @param {*} forceForward 
            * @param {*} options 
            * @returns 
           */
                m.quoted.copyNForward = (jid, forceForward = false, options = {}) => anubis.copyNForward(jid, vM, forceForward, options)
    
                /**
                  *
                  * @returns
                */
                m.quoted.download = () => anubis.downloadMediaMessage(m.quoted)
            }
        }
        if (m.msg.url) m.download = () => anubis.downloadMediaMessage(m.msg)
        m.text = m.msg.text || m.msg.caption || m.message.conversation || m.msg.contentText || m.msg.selectedDisplayText || m.msg.title || ''
        /**
        * Reply to this message
        * @param {String|Object} text 
        * @param {String|false} chatId 
        * @param {Object} options 
        */
        m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? anubis.sendMedia(chatId, text, 'file', '', m, { ...options }) : anubis.sendText(chatId, text, m, { ...options })
        /**
        * Copy this message
        */
        m.copy = () => exports.smsg(anubis, M.fromObject(M.toObject(m)))
    
        /**
         * 
         * @param {*} jid 
         * @param {*} forceForward 
         * @param {*} options 
         * @returns 
         */
        m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => anubis.copyNForward(jid, m, forceForward, options)
    
        return m
    }

    const ucapan = () => {
        const time = moment.tz('Asia/Jakarta').format('HH')
        let res = "Selamat pagi, belum tidur?"
        if (time >= 4) {
          res = "Selamat pagi sayang"
        }
        if (time > 10) {
          res = "Selamat siang sayang"
        }
        if (time >= 15) {
          res = "Selamat sore sayang"
        }
        if (time >= 18) {
          res = "Selamat malam sayang"
        }
        return res
    }

    function msToTime(s) {
      var ms = s % 1000;
      s = (s - ms) / 1000;
      var secs = s % 60;
      s = (s - secs) / 60;
      var mins = s % 60;
      var hrs = (s - mins) / 60;
    
      return hrs + ':' + mins + ':' + secs + '.' + ms;
    }

    function msToMinute(millis) {
      var minutes = Math.floor(millis / 60000);
      var seconds = ((millis % 60000) / 1000).toFixed(0);
      return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
    }

    const runtime = (seconds) => {
        seconds = Number(seconds);
        var d = Math.floor(seconds / (3600 * 24));
        var h = Math.floor(seconds % (3600 * 24) / 3600);
        var m = Math.floor(seconds % 3600 / 60);
        var s = Math.floor(seconds % 60);
        var dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
        var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
        var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
        var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
        return dDisplay + hDisplay + mDisplay + sDisplay;
    }
    const ytDislike = (id) => {
        return new Promise(async (resolve, reject) => {
          const ax = await axios.get("https://returnyoutubedislikeapi.com/votes?videoId=" + id)
          resolve(ax.data)
        });
    }
    const getRandom = (ext) => {
        return `${Math.floor(Math.random() * 10000)}${ext}`
    } 

    const sleep = async (ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
  }

    const igjson = (id) => {
        return new Promise((resolve, reject) => {
          //   const regex = /(https?:\/\/)?(www.)?instagram.com\/?([a-zA-Z0-9\.\_\-]+)?\/([p]+)?([reel]+)?([tv]+)?([stories]+)?\/([a-zA-Z0-9\-\_\.]+)\/?([0-9]+)?/g;
          let hasil = [];
          let user = {};
          let post = {};
          let media = [];
          let promoses = [];
          promoses.push(
            axios
              .get(`https://i.instagram.com/api/v1/media/${id}/info/`, {
                headers: {
                    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
                    cookie: anuCookie.ig,
                    "x-ig-app-id": 936619743392459,
                    "x-ig-www-claim":0,
                    "x-asbd-id":198387,
                    Accept: "*/*",
                },
              })
              .then(({ data }) => {
               
                let j = data.items[0];
    
                if (j.carousel_media) {
                  for (var i = 0; i < j.carousel_media.length; i++) {
                    let jj = j.carousel_media[i];
                    if (jj.video_versions) {
                      media.push({
                        url: jj.video_versions[0].url,
                        type: "mp4",
                      });
                    } else {
                      media.push({
                        url: jj.image_versions2.candidates[0].url,
                        type: "jpg",
                      });
                    }
                  }
                } else if (j.video_versions) {
                  media.push({
                    url: j.video_versions[0].url,
                    type: "mp4",
                  });
                } else {
                  media.push({
                    url: j.image_versions2.candidates[0].url,
                    type: "jpg",
                  });
                }
                let cap;
                if (j.caption == null) {
                  cap = "";
                } else {
                  cap = j.caption.text;
                }
                user = {
                  username: j.user.username,
                  full_name: j.user.full_name,
                  is_private: j.user.is_private,
                  is_verified: j.user.is_verified,
                  profile_pic_url: j.user.profile_pic_url,
                  id: j.user.pk,
                };
    
                if (j.taken_at) {
                  post = {
                    title: j.title,
                    caption: cap,
                    taken_at: j.taken_at,
                    comment_count: j.comment_count,
                    like_count: j.like_count,
                    video_duration: j.video_duration,
                    view_count: j.view_count,
                    play_count: j.play_count,
                    has_audio: j.has_audio,
                  };
                }
    
                hasil.push({
                  user: user,
                  post: post,
                  media: media,
                });
    
                Promise.all(promoses).then(() =>
                  resolve({
                    creator: "anubis-bot",
                    status: true,
                    data: hasil,
                  })
                );
              })
              .catch(reject)
          );
        });
      }

      const iggetid = (query) => {
        return new Promise( async(resolve, reject) => {
          // const regex = /(https?:\/\/)?(www.)?instagram.com\/?([a-zA-Z0-9\.\_\-]+)?\/([p]+)?([reel]+)?([tv]+)?([stories]+)?\/([a-zA-Z0-9\-\_\.]+)\/?([0-9]+)?/g;
          let promoses = [];
          // let iglink = regex.exec(query);
          const igid = await axios(
            {
                url: `https://www.instagram.com/graphql/query/?query_hash=d4e8ae69cb68f66329dcebe82fb69f6d&variables={"shortcode":"${query}"}`,
                headers: {
                    "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
                    cookie: anuCookie.ig,
                    },
                data: null,
                method: "GET",
            }
          )
              try {
                resolve({status: true, id: igid.data.data.shortcode_media.id})
              } catch (e) {
                resolve({status: false})
              }
        });
      }

      const igstory = (query) => {
        return new Promise(async(resolve, reject) => {
          let media = [];
          let hasil = [];
          let user = {};
          let promoses = [];
          promoses.push(
            axios
              .get(
                `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${query}`,
                {
                  headers: {
                    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
                    cookie: anuCookie.ig,
                    "x-ig-app-id": 936619743392459,
                    "x-ig-www-claim":0,
                    "x-asbd-id":198387,
                    Accept: "*/*",
                  },
                }
              )
              .then(({ data }) => {
                let j = data.reels_media[0];
                for (var i = 0; i < j.items.length; i++) {
                  let jj = j.items[i];
                  let cap;
                  if (jj.caption == null) {
                    cap = "";
                  } else {
                    cap = jj.caption.text;
                  }
                  if (jj.video_versions) {
                    media.push({
                      url: jj.video_versions[0].url,
                      type: "mp4",
                      caption: cap,
                      taken_at: jj.taken_at,
                    });
                  } else {
                    media.push({
                      url: jj.image_versions2.candidates[0].url,
                      type: "jpg",
                      caption: cap,
                      taken_at: jj.taken_at,
                    });
                  }
                }
                user = {
                  username: j.user.username,
                  full_name: j.user.full_name,
                  is_private: j.user.is_private,
                  is_verified: j.user.is_verified,
                  profile_pic_url: j.user.profile_pic_url,
                };
                hasil.push({
                  user: user,
                  media: media,
                });
                Promise.all(promoses).then(() =>
                  resolve({
                    creator: "anubis-bot",
                    status: true,
                    data: hasil,
                  })
                );
              })
          );
        });
      }

      const tiktok = (url) => {
        return new Promise(async(resolve, reject) => {
          const tt = await axios({
            url: "https://api.app.downtik.com/a.php",
            method: "POST",
            headers: {
              accept: "*/*",
              "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
              "x-requested-with": "XMLHttpRequest",
            },
            data: `url=${url}&lang=id`,
          })
          const $ = cheerio.load(tt.data)
            resolve({
              profile: $("div > div > div:nth-child(1) > img").attr("src"),
              name: $("div > div > div:nth-child(1) > div > h3").text(),
              cap: $("div > div > div:nth-child(1) > div > p").text(),
              nowm: $("div > div > div:nth-child(2) > a:nth-child(1)").attr("href"),
            })
        })
      }

      function pinterest(querry){
        return new Promise(async(resolve,reject) => {
           axios.get('https://id.pinterest.com/search/pins/?autologin=true&q=' + querry, {
            headers: {
            "cookie" : "_auth=1; _b=\"AVna7S1p7l1C5I9u0+nR3YzijpvXOPc6d09SyCzO+DcwpersQH36SmGiYfymBKhZcGg=\"; _pinterest_sess=TWc9PSZHamJOZ0JobUFiSEpSN3Z4a2NsMk9wZ3gxL1NSc2k2NkFLaUw5bVY5cXR5alZHR0gxY2h2MVZDZlNQalNpUUJFRVR5L3NlYy9JZkthekp3bHo5bXFuaFZzVHJFMnkrR3lTbm56U3YvQXBBTW96VUgzVUhuK1Z4VURGKzczUi9hNHdDeTJ5Y2pBTmxhc2owZ2hkSGlDemtUSnYvVXh5dDNkaDN3TjZCTk8ycTdHRHVsOFg2b2NQWCtpOWxqeDNjNkk3cS85MkhhSklSb0hwTnZvZVFyZmJEUllwbG9UVnpCYVNTRzZxOXNJcmduOVc4aURtM3NtRFo3STlmWjJvSjlWTU5ITzg0VUg1NGhOTEZzME9SNFNhVWJRWjRJK3pGMFA4Q3UvcHBnWHdaYXZpa2FUNkx6Z3RNQjEzTFJEOHZoaHRvazc1c1UrYlRuUmdKcDg3ZEY4cjNtZlBLRTRBZjNYK0lPTXZJTzQ5dU8ybDdVS015bWJKT0tjTWYyRlBzclpiamdsNmtpeUZnRjlwVGJXUmdOMXdTUkFHRWloVjBMR0JlTE5YcmhxVHdoNzFHbDZ0YmFHZ1VLQXU1QnpkM1FqUTNMTnhYb3VKeDVGbnhNSkdkNXFSMXQybjRGL3pyZXRLR0ZTc0xHZ0JvbTJCNnAzQzE0cW1WTndIK0trY05HV1gxS09NRktadnFCSDR2YzBoWmRiUGZiWXFQNjcwWmZhaDZQRm1UbzNxc21pV1p5WDlabm1UWGQzanc1SGlrZXB1bDVDWXQvUis3elN2SVFDbm1DSVE5Z0d4YW1sa2hsSkZJb1h0MTFpck5BdDR0d0lZOW1Pa2RDVzNySWpXWmUwOUFhQmFSVUpaOFQ3WlhOQldNMkExeDIvMjZHeXdnNjdMYWdiQUhUSEFBUlhUVTdBMThRRmh1ekJMYWZ2YTJkNlg0cmFCdnU2WEpwcXlPOVZYcGNhNkZDd051S3lGZmo0eHV0ZE42NW8xRm5aRWpoQnNKNnNlSGFad1MzOHNkdWtER0xQTFN5Z3lmRERsZnZWWE5CZEJneVRlMDd2VmNPMjloK0g5eCswZUVJTS9CRkFweHc5RUh6K1JocGN6clc1JmZtL3JhRE1sc0NMTFlpMVErRGtPcllvTGdldz0=; _ir=0"
          }
            }).then(({ data }) => {
          const $ = cheerio.load(data)
          const result = [];
          const hasil = [];
              $('div > a').get().map(b => {
              const link = $(b).find('img').attr('src')
                  result.push(link)
          });
             result.forEach(v => {
           if(v == undefined) return
           hasil.push(v.replace(/236/g,'736'))
            })
            hasil.shift();
          resolve(hasil)
          })
        })
      }

      function hagodl(query) {
        return new Promise(async(resolve, reject) => {
          let promoses = [];
          let media = [];
          axios.get(query).then(({request}) => {
            let regx = /postId\=([0-9]*)\&/i
            let preg = regx.exec(request.res.responseUrl);
            // console.log()
            return preg[1]
          }).then((postId) => {
            return axios.get(`https://i-863.ihago.net/bbs/get_post_info?data={"post_id":"${postId}","lang":"id"}`)
          }).then(({data}) => {
            // return console.log(data)
            if (data.code !== 1) return resolve({status: false})
            if (data.data.info.video) {
            let video = [data.data.info.video]
                media.push({
                    url: video,
                    type: "mp4",
                });
            } else {
                media.push({
                    url: data.data.info.images,
                    type: "jpg",
                });
            }
            return resolve({
                status: true,
                nick: data.data.info.creator.nick,
                avatar: data.data.info.creator.avatar,
                sex: data.data.info.creator.sex,
                birth: data.data.info.creator.birth,
                post_id: data.data.info.post_id,
                tag_name: data.data.info.tag_name,
                text: data.data.info.text,
                media: media,
                likes: data.data.info.likes,
                replys: data.data.info.replys || ''
            })
            });
        });
      }

    function subFinder(url) {
      return new Promise(async(resolve) => {
          axios({
              url: 'https://opentunnel.net/subdomain-finder',
              headers: {
                  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                  'Accept': '*/*',
                  'X-Requested-With': 'XMLHttpRequest',
              },
              data: `g-recaptcha-response=03ANYolqsVi0vgOx8zJdI4bfM-6Q_7Rw-e7-mpsnDOo0O18lEUk2LUi33fgXbT0jvPFPHXzb2o3W7goQBqJk8Dd7IbutnoXyr1vJFUr8lle1sgU7A_zHUf76Bz-TxDf71fmX88johua53qHzlZy0ADE9PU2ogciIOOFPvWK5HO1zP4r2rvfum_pXzdatjjLvQohYteWZj2xNKWnaL__qLkFp0g-48bal7NuDs-Tc_EAH41iKumQsGiMcdyvziJgGJHpvNVPllfvghWxdNr1DtX-E7mLTbV1OKnfG6UMB3AUYY499Jvi5_q1DFntNOZSxS1FbHdHFvmGy0iKNdN_hspXgIgQFug_Bx-ZNiMyGHfci5IXtyms48544ce3IKArnxWBDP8k6pDFCxGayTjthgUCE8HUU4M9O9knEayGmQ6tA-uRj1dLudMVXE-Fj-ILdAeXlqbsGoAO8ED3JY1vbmQ0uJAvZTLgLI-5M-CUQmO-o77NtP7w8OUdLebgtpN9UoB8sFUw8CCQcqQqRviQheIkJAC7w7PB2c4Qw&action=validate_captcha&domain=`+ url,
              method: 'POST'
          }).then(({data}) => {
              let out = []
              const $ = cheerio.load(data)
              const a = $('div.table-responsive > table > tbody > tr')
              for (let i = 0; i < a.length; i++) {
                  const cf = $(a[i]).find('td:nth-child(1) > img').attr('alt')
                  const subdom = $(a[i]).find('td:nth-child(2) > a').text()
                  const ip = $(a[i]).find('td:nth-child(3) > a').text()
                  const country = $(a[i]).find('td:nth-child(4) > img').attr('alt')
                  const isp = $(a[i]).find('td:nth-child(5)').text()
                  let clf
                  if (cf == 'cloudflare_on') {
                      clf = true
                  } else {
                      clf = false
                  }

                  out.push({
                      cloudflare: clf,
                      subdomain: subdom,
                      ip: ip,
                      country: country,
                      isp: isp,
                  })
              }
              if (out.cloudflare == '') return resolve({status: false})
              resolve({status: true, data: out})
          })
      })
  }

  const ytUrlRegex = /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/;

  /**
   * 
   * @param {string} id // youtube id / url
   * @returns 
   */
  function ytdlr(id){
    let ytId
    if (isUrl(id)) {
        let getid = ytUrlRegex.exec(id)
        ytId = getid[1]
    } else {
        ytId = id
    }
    return new Promise(async(resolve) => {
        let mp3 = []
        let mp4 = []
        axios({
            url: `https://api.btclod.com/v1/youtube/extract-infos/?detail=${ytId}&video=1`,
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'authorization': '',
            },
            method: 'GET',
        }).then(({data}) => {
            if (data.code !== 200) return resolve({status: false})
            let ytdl = data.data
            for (let i=0; i<ytdl.audios.length; i++){
                if (ytdl.audios[i].extension == 'mp3'){
                    let anu = ytdl.audios[i]
                    if (anu.file_size !== null) {
                        let cek = false
                        for (let resl in mp3){
                            if (mp3[resl].reso == anu.format_note){
                                cek = true
                            } else {
                                cek = false
                            }
                        }
                        if (!cek) {
                            let size = anu.file_size
                            let reso = anu.format_note
                            let urldir = 'https://api.btclod.com' + anu.url
                            mp3.push({
                                urldir,
                                size,
                                reso,
                            })
                        }
                    }
                }
            }
            for (let i=0; i<ytdl.videos.length; i++){
                if (ytdl.videos[i].extension == 'mp4'){
                    let anu = ytdl.videos[i]
                    if (anu.file_size !== null) {
                        let cek = false
                        for (let resl in mp4){
                            if (mp4[resl].reso == anu.format_note){
                                cek = true
                            } else {
                                cek = false
                            }
                        }
                        if (!cek) {
                            let size = anu.file_size
                            let reso = anu.format_note
                            let urldir = 'https://api.btclod.com' + anu.url
                            mp4.push({
                                urldir,
                                size,
                                reso,
                            })
                        }
                    }
                }
            }
            resolve({
                status: true,
                title: ytdl.detail.title,
                id: ytdl.detail.id,
                thumb: `https://img.youtube.com/vi/${ytdl.detail.id}/mqdefault.jpg`,
                desc: ytdl.detail.description,
                durasi: ytdl.detail.duration,
                chname: ytdl.detail.extra_data.channel_title,
                publish: ytdl.detail.extra_data.publishedAt,
                view: ytdl.detail.extra_data.viewCount,
                mp3,
                mp4,
            })
        })
    })
}

function ytdlr2(url){
  return new Promise(async(resolve) => {
      axios({
          url: "https://srv6.onlymp3.to/listFormats?url="+ url,
          "headers": {
              "accept": "application/json, text/javascript, */*; q=0.01",
              "accept-language": "en-US,en;q=0.9,id;q=0.8",
              "sec-ch-ua": "\"Chromium\";v=\"104\", \" Not A;Brand\";v=\"99\", \"Google Chrome\";v=\"104\"",
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": "\"Windows\"",
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-site",
              "Referer": "https://en.onlymp3.to/",
              "Referrer-Policy": "strict-origin-when-cross-origin"
          },
          "data": null,
          "method": "GET"
      }).then(({data}) => {
          if (data.error) return resolve({status: false})
          if (data.status !== 'OK') return resolve({status: false})
          let anubis = {
            status: true,
            title: data.formats.title,
            duration: msToMinute(data.formats.duration),
            thumb: data.formats.thumbnail,
            video: data.formats.video,
            audio: data.formats.audio,
          }
          return resolve(anubis)
      })
  })
}

module.exports = {
  getBuffer,
  fetchJson,
  getSizeMedia,
  smsg,
  ucapan,
  runtime,
  formatp,
  byteToSize,
  ytDislike,
  getRandom,
  igjson,
  iggetid,
  igstory,
  tiktok,
  urlDirect,
  pinterest,
  hagodl,
  subFinder,
  ytUrlRegex,
  ytdlr,
  ytdlr2,
  sleep,
  msToTime,
  msToMinute,
}


let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  console.log("Update 'lib.js'")
  delete require.cache[file]
  if (global.reloadHandler) console.log(global.reloadHandler())
})