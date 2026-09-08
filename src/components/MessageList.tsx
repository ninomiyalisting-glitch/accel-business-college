'use client'

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Smile, Pencil, X } from 'lucide-react'
import { Message, ReactionsMap, CustomEmojis, SlackFile } from '@/types'
import { SLACK_USER_NAMES } from '@/lib/slackUserNames'
import MemberPopup, { MemberInfo } from './MemberPopup'

// Slack standard emoji name → emoji character
const SLACK_EMOJI: Record<string, string> = {
  // hands / gestures
  '+1': '👍', 'thumbsup': '👍', '-1': '👎', 'thumbsdown': '👎',
  'clap': '👏', 'raised_hands': '🙌', 'pray': '🙏', 'wave': '👋',
  'ok_hand': '👌', 'muscle': '💪', 'point_up': '☝️', 'point_up_2': '👆',
  'point_down': '👇', 'point_left': '👈', 'point_right': '👉',
  'v': '✌️', 'metal': '🤘', 'crossed_fingers': '🤞', 'pinching_hand': '🤏',
  // faces
  'smile': '😊', 'smiley': '😃', 'grinning': '😀', 'grin': '😁',
  'joy': '😂', 'rolling_on_the_floor_laughing': '🤣', 'rofl': '🤣',
  'sweat_smile': '😅', 'laughing': '😆', 'satisfied': '😆',
  'wink': '😉', 'blush': '😊', 'relaxed': '🙂', 'slightly_smiling_face': '🙂',
  'upside_down_face': '🙃', 'heart_eyes': '😍', 'star-struck': '🤩',
  'kissing_heart': '😘', 'kissing': '😗', 'kissing_smiling_eyes': '😙',
  'yum': '😋', 'stuck_out_tongue': '😛', 'stuck_out_tongue_winking_eye': '😜',
  'stuck_out_tongue_closed_eyes': '😝', 'money_mouth_face': '🤑',
  'hugs': '🤗', 'hugging_face': '🤗', 'thinking_face': '🤔', 'thinking': '🤔',
  'zipper_mouth_face': '🤐', 'raised_eyebrow': '🤨', 'neutral_face': '😐',
  'expressionless': '😑', 'no_mouth': '😶', 'smirk': '😏',
  'unamused': '😒', 'roll_eyes': '🙄', 'grimacing': '😬',
  'lying_face': '🤥', 'relieved': '😌', 'pensive': '😔', 'sleepy': '😪',
  'drooling_face': '🤤', 'sleeping': '😴', 'mask': '😷',
  'face_with_thermometer': '🤒', 'face_with_head_bandage': '🤕',
  'nauseated_face': '🤢', 'sneezing_face': '🤧', 'hot_face': '🥵',
  'cold_face': '🥶', 'woozy_face': '🥴', 'dizzy_face': '😵',
  'exploding_head': '🤯', 'cowboy_hat_face': '🤠', 'partying_face': '🥳',
  'sunglasses': '😎', 'nerd_face': '🤓', 'monocle_face': '🧐',
  'confused': '😕', 'worried': '😟', 'slightly_frowning_face': '🙁',
  'frowning_face': '☹️', 'open_mouth': '😮', 'hushed': '😯',
  'astonished': '😲', 'flushed': '😳', 'pleading_face': '🥺',
  'anguished': '😧', 'fearful': '😨', 'cold_sweat': '😰',
  'disappointed_relieved': '😥', 'cry': '😢', 'sob': '😭',
  'scream': '😱', 'confounded': '😖', 'persevere': '😣',
  'disappointed': '😞', 'sweat': '😓', 'weary': '😩', 'tired_face': '😫',
  'yawning_face': '🥱', 'triumph': '😤', 'rage': '😡', 'angry': '😠',
  'skull': '💀', 'skull_and_crossbones': '☠️', 'poop': '💩',
  'clown_face': '🤡', 'japanese_ogre': '👹', 'japanese_goblin': '👺',
  'ghost': '👻', 'alien': '👽', 'space_invader': '👾', 'robot': '🤖',
  'innocent': '😇', 'smiling_imp': '😈', 'imp': '👿',
  'see_no_evil': '🙈', 'hear_no_evil': '🙉', 'speak_no_evil': '🙊',
  'bow': '🙇', 'saluting_face': '🫡',
  'smiling_face_with_tear': '🥲',
  // hearts
  'heart': '❤️', 'orange_heart': '🧡', 'yellow_heart': '💛',
  'green_heart': '💚', 'blue_heart': '💙', 'purple_heart': '💜',
  'brown_heart': '🤎', 'black_heart': '🖤', 'white_heart': '🤍',
  'broken_heart': '💔', 'heart_on_fire': '❤️‍🔥', 'two_hearts': '💕',
  'sparkling_heart': '💖', 'heartpulse': '💗', 'heartbeat': '💓',
  'revolving_hearts': '💞', 'heart_decoration': '💟', 'heavy_heart_exclamation': '❣️',
  'cupid': '💘', 'gift_heart': '💝', 'heart_eyes_cat': '😻',
  // nature / animals
  'dog': '🐶', 'cat': '🐱', 'mouse': '🐭', 'hamster': '🐹',
  'rabbit': '🐰', 'fox_face': '🦊', 'bear': '🐻', 'panda_face': '🐼',
  'koala': '🐨', 'tiger': '🐯', 'lion': '🦁', 'cow': '🐮',
  'pig': '🐷', 'frog': '🐸', 'monkey_face': '🐵', 'chicken': '🐔',
  'penguin': '🐧', 'bird': '🐦', 'baby_chick': '🐤', 'hatching_chick': '🐣',
  'hatched_chick': '🐥', 'duck': '🦆', 'eagle': '🦅', 'owl': '🦉',
  'bat': '🦇', 'wolf': '🐺', 'boar': '🐗', 'horse': '🐴',
  'unicorn': '🦄', 'bee': '🐝', 'bug': '🐛', 'butterfly': '🦋',
  'snail': '🐌', 'shell': '🐚', 'ladybug': '🐞', 'ant': '🐜',
  'mosquito': '🦟', 'cricket': '🦗', 'turtle': '🐢', 'snake': '🐍',
  'dragon_face': '🐲', 'sauropod': '🦕', 't-rex': '🦖',
  'whale': '🐳', 'whale2': '🐋', 'dolphin': '🐬', 'fish': '🐟',
  'tropical_fish': '🐠', 'blowfish': '🐡', 'shark': '🦈', 'octopus': '🐙',
  'crab': '🦀', 'lobster': '🦞', 'shrimp': '🦐', 'squid': '🦑',
  'sneezing_face2': '🤧', 'bouquet': '💐', 'cherry_blossom': '🌸',
  'white_flower': '💮', 'rosette': '🏵️', 'rose': '🌹', 'wilted_flower': '🥀',
  'hibiscus': '🌺', 'sunflower': '🌻', 'blossom': '🌼', 'tulip': '🌷',
  'seedling': '🌱', 'evergreen_tree': '🌲', 'deciduous_tree': '🌳',
  'palm_tree': '🌴', 'cactus': '🌵', 'ear_of_rice': '🌾',
  'herb': '🌿', 'shamrock': '☘️', 'four_leaf_clover': '🍀',
  'maple_leaf': '🍁', 'fallen_leaf': '🍂', 'leaves': '🍃',
  // food
  'grapes': '🍇', 'melon': '🍈', 'watermelon': '🍉', 'tangerine': '🍊',
  'lemon': '🍋', 'banana': '🍌', 'pineapple': '🍍', 'mango': '🥭',
  'apple': '🍎', 'green_apple': '🍏', 'pear': '🍐', 'peach': '🍑',
  'cherries': '🍒', 'strawberry': '🍓', 'blueberries': '🫐',
  'kiwi_fruit': '🥝', 'tomato': '🍅', 'olive': '🫒', 'coconut': '🥥',
  'avocado': '🥑', 'eggplant': '🍆', 'potato': '🥔', 'carrot': '🥕',
  'corn': '🌽', 'hot_pepper': '🌶️', 'bell_pepper': '🫑',
  'cucumber': '🥒', 'leafy_green': '🥬', 'broccoli': '🥦',
  'garlic': '🧄', 'onion': '🧅', 'mushroom': '🍄', 'peanuts': '🥜',
  'chestnut': '🌰', 'bread': '🍞', 'croissant': '🥐', 'baguette_bread': '🥖',
  'flatbread': '🫓', 'pretzel': '🥨', 'bagel': '🥯', 'pancakes': '🥞',
  'waffle': '🧇', 'cheese': '🧀', 'meat_on_bone': '🍖', 'poultry_leg': '🍗',
  'cut_of_meat': '🥩', 'bacon': '🥓', 'hamburger': '🍔', 'fries': '🍟',
  'pizza': '🍕', 'hotdog': '🌭', 'sandwich': '🥪', 'taco': '🌮',
  'burrito': '🌯', 'tamale': '🫔', 'stuffed_flatbread': '🥙',
  'falafel': '🧆', 'egg': '🥚', 'fried_egg': '🍳', 'shallow_pan_of_food': '🥘',
  'stew': '🍲', 'fondue': '🫕', 'bowl_with_spoon': '🥣',
  'green_salad': '🥗', 'popcorn': '🍿', 'butter': '🧈', 'salt': '🧂',
  'canned_food': '🥫', 'bento': '🍱', 'rice_cracker': '🍘', 'rice_ball': '🍙',
  'rice': '🍚', 'curry': '🍛', 'ramen': '🍜', 'spaghetti': '🍝',
  'sweet_potato': '🍠', 'oden': '🍢', 'sushi': '🍣', 'fried_shrimp': '🍤',
  'fish_cake': '🍥', 'moon_cake': '🥮', 'dango': '🍡', 'dumpling': '🥟',
  'fortune_cookie': '🥠', 'takeout_box': '🥡', 'crab2': '🦀',
  'icecream': '🍦', 'shaved_ice': '🍧', 'ice_cream': '🍨',
  'doughnut': '🍩', 'cookie': '🍪', 'birthday': '🎂', 'cake': '🍰',
  'cupcake': '🧁', 'pie': '🥧', 'chocolate_bar': '🍫', 'candy': '🍬',
  'lollipop': '🍭', 'custard': '🍮', 'honey_pot': '🍯',
  'coffee': '☕', 'teapot': '🫖', 'tea': '🍵', 'sake': '🍶',
  'champagne': '🍾', 'wine_glass': '🍷', 'cocktail': '🍸',
  'tropical_drink': '🍹', 'beer': '🍺', 'beers': '🍻',
  'clinking_glasses': '🥂', 'tumbler_glass': '🥃', 'cup_with_straw': '🥤',
  'bubble_tea': '🧋', 'beverage_box': '🧃', 'mate': '🧉', 'ice_cube': '🧊',
  'chopsticks': '🥢', 'plate_with_cutlery': '🍽️', 'fork_and_knife': '🍴',
  'spoon': '🥄', 'knife': '🔪', 'jar': '🫙',
  // symbols
  'sparkles': '✨', 'star': '⭐', 'star2': '🌟', 'dizzy': '💫',
  'boom': '💥', 'collision': '💥', 'anger': '💢', 'speech_balloon': '💬',
  'thought_balloon': '💭', 'zzz': '💤', 'wave_sound': '〰️',
  'fire': '🔥', 'tada': '🎉', 'confetti_ball': '🎊', 'balloon': '🎈',
  'trophy': '🏆', 'medal': '🏅', 'first_place_medal': '🥇',
  'second_place_medal': '🥈', 'third_place_medal': '🥉',
  'rocket': '🚀', 'star-struck2': '🌠', 'bulb': '💡',
  'white_check_mark': '✅', 'x': '❌', 'heavy_check_mark': '✔️',
  'warning': '⚠️', 'bangbang': '‼️', 'interrobang': '⁉️',
  'memo': '📝', 'pencil': '✏️', 'pen': '🖊️', 'email': '📧',
  'mailbox': '📫', 'inbox_tray': '📥', 'outbox_tray': '📤',
  'package': '📦', 'label': '🏷️', 'bookmark': '🔖',
  'moneybag': '💰', 'coin': '🪙', 'dollar': '💵', 'euro': '💶',
  'yen': '💴', 'chart': '💹', 'chart_with_upwards_trend': '📈',
  'chart_with_downwards_trend': '📉', 'bar_chart': '📊',
  'calendar': '📅', 'date': '📅', 'clock1': '🕐', 'alarm_clock': '⏰',
  'hourglass': '⌛', 'hourglass_flowing_sand': '⏳',
  'globe_with_meridians': '🌐', 'earth_americas': '🌎',
  'earth_africa': '🌍', 'earth_asia': '🌏',
  'sunny': '☀️', 'cloud': '☁️', 'partly_sunny': '⛅',
  'rainbow': '🌈', 'snowflake': '❄️', 'snowman': '⛄',
  'umbrella': '☂️', 'zap': '⚡', 'cyclone': '🌀',
  'foggy': '🌁', 'night_with_stars': '🌃', 'cityscape': '🏙️',
  'sunrise': '🌅', 'sunrise_over_mountains': '🌄',
  'ocean': '🌊', 'volcano': '🌋', 'mount_fuji': '🗻',
  // people
  'man-running': '🏃', 'woman-running': '🏃‍♀️', 'runner': '🏃',
  'walking': '🚶', 'man-walking': '🚶', 'woman-walking': '🚶‍♀️',
  'man-bowing': '🙇', 'woman-bowing': '🙇‍♀️',
  'man': '👨', 'woman': '👩', 'boy': '👦', 'girl': '👧',
  'baby': '👶', 'older_man': '👴', 'older_woman': '👵',
  'technologist': '🧑‍💻', 'office_worker': '🧑‍💼',
  'doctor': '🧑‍⚕️', 'teacher': '🧑‍🏫', 'student': '🧑‍🎓',
  // misc
  'one': '1️⃣', 'two': '2️⃣', 'three': '3️⃣', 'four': '4️⃣', 'five': '5️⃣',
  'six': '6️⃣', 'seven': '7️⃣', 'eight': '8️⃣', 'nine': '9️⃣', 'zero': '0️⃣',
  '100': '💯', 'eyes': '👀', 'ear': '👂', 'nose': '👃',
  'brain': '🧠', 'tooth': '🦷', 'bone': '🦴', 'leg': '🦵', 'foot': '🦶',
  'flexed_biceps': '💪',
}

// Quick-pick emojis for the picker
const QUICK_EMOJIS = [
  { name: '+1', char: '👍' },
  { name: 'heart', char: '❤️' },
  { name: 'blush', char: '😊' },
  { name: 'tada', char: '🎉' },
  { name: 'clap', char: '👏' },
  { name: 'pray', char: '🙏' },
  { name: 'muscle', char: '💪' },
  { name: 'fire', char: '🔥' },
  { name: 'white_check_mark', char: '✅' },
  { name: 'joy', char: '😂' },
]

// Returns emoji char for standard reactions, or :name: for custom/unknown
function renderReaction(reaction: string, customEmojis?: CustomEmojis): React.ReactNode {
  const base = reaction.replace(/::skin-tone-\d$/, '').replace(/:skin-tone-\d$/, '')
  const char = SLACK_EMOJI[base] ?? SLACK_EMOJI[reaction]
  if (char) return char
  const url = customEmojis?.[base] ?? customEmojis?.[reaction]
  if (url) return <img src={url} alt={reaction} title={reaction} loading="lazy" decoding="async" width={16} height={16} className="inline-block w-4 h-4 object-contain align-middle" />
  return `:${reaction}:`
}

// Token regex: emoji, mention, link, special mention
const SLACK_TOKEN_RE = /(:[a-zA-Z0-9_+\-]+(?:::skin-tone-\d)?:|<@[A-Z0-9]+(?:\|[^>]*)?>|<https?:\/\/[^>]+>|<!(?:channel|here|everyone)>)/g

// Parse message content: emoji / mentions / links
function renderContent(content: string, customEmojis?: CustomEmojis): React.ReactNode[] {
  const parts = content.split(SLACK_TOKEN_RE)
  return parts.map((part, i) => {
    if (!part) return null

    // Mention: <@USERID> or <@USERID|display>
    const mentionMatch = part.match(/^<@([A-Z0-9]+)(?:\|([^>]*))?>\s*$/)
    if (mentionMatch) {
      const uid = mentionMatch[1]
      const name = mentionMatch[2] || SLACK_USER_NAMES[uid] || uid
      return (
        <span key={i} className="text-accel-active bg-accel-lightest rounded px-0.5 font-medium">
          @{name}
        </span>
      )
    }

    // Special mentions: <!channel>, <!here>, <!everyone>
    if (part === '<!channel>' || part === '<!here>' || part === '<!everyone>') {
      return (
        <span key={i} className="text-accel-active bg-accel-lightest rounded px-0.5 font-medium">
          @{part.slice(2, -1)}
        </span>
      )
    }

    // Link: <https://url|text> or <https://url>
    const linkMatch = part.match(/^<(https?:\/\/[^|>]+)(?:\|([^>]*))?>$/)
    if (linkMatch) {
      const href = linkMatch[1]
      const text = linkMatch[2] || href
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer"
           className="text-accel-active hover:underline break-all">
          {text}
        </a>
      )
    }

    // Emoji: :name:
    const emojiMatch = part.match(/^:([\w+\-]+(?:::skin-tone-\d)?):$/)
    if (emojiMatch) {
      const name = emojiMatch[1]
      const base = name.replace(/::skin-tone-\d$/, '').replace(/:skin-tone-\d$/, '')
      const char = SLACK_EMOJI[base] ?? SLACK_EMOJI[name]
      if (char) return <span key={i} title={name}>{char}</span>
      const url = customEmojis?.[name] ?? customEmojis?.[base]
      if (url) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={url} alt={name} title={name} loading="lazy" decoding="async" width={20} height={20} className="inline-block w-5 h-5 object-contain align-middle mx-0.5" />
        )
      }
      return <span key={i} className="text-gray-500 text-sm">{`:${name}:`}</span>
    }

    return part
  }).filter(Boolean) as React.ReactNode[]
}

// File attachment display (images proxied through our API, others shown as links)
function FileAttachments({ files }: { files: SlackFile[] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file, idx) => {
        const isImage = file.mimetype?.startsWith('image/')
        // Prefer url_private_download (works with files:read scope), fallback to thumb, then url_private
        const downloadUrl = file.url_private_download || file.url_private
        const thumbUrl = file.thumb_360 || file.url_private_download || file.url_private

        if (isImage && thumbUrl) {
          const proxyThumb = `/api/slack/image-proxy?url=${encodeURIComponent(thumbUrl)}`
          const proxyFull = downloadUrl ? `/api/slack/image-proxy?url=${encodeURIComponent(downloadUrl)}` : proxyThumb
          return (
            <a key={idx} href={proxyFull} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxyThumb}
                alt={file.name || 'image'}
                className="max-w-xs max-h-48 rounded-lg object-contain border border-gray-200 hover:opacity-90 transition-opacity"
              />
            </a>
          )
        }

        // Non-image file
        const proxyUrl = downloadUrl ? `/api/slack/image-proxy?url=${encodeURIComponent(downloadUrl)}` : '#'
        return (
          <a
            key={idx}
            href={proxyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 hover:bg-gray-200 transition-colors"
          >
            📎 {file.name || 'ファイル'}
          </a>
        )
      })}
    </div>
  )
}

// Emoji picker popup (fixed positioning anchored to a button — overflow:hidden の親に影響されない)
function EmojiPicker({
  anchor,
  onSelect,
  onClose,
  customEmojis,
}: {
  anchor: HTMLElement
  onSelect: (reaction: string) => void
  onClose: () => void
  customEmojis?: CustomEmojis
}) {
  const customList = Object.entries(customEmojis ?? {}).slice(0, 40)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const PICKER_W = 240   // w-60 = 15rem = 240px
  const PICKER_H = 280   // 概算: quick row + custom grid
  const MARGIN = 8

  useEffect(() => {
    const update = () => {
      const r = anchor.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      // 縦: トリガーの上に出す。はみ出すなら下に。
      let top = r.top - PICKER_H - MARGIN
      if (top < MARGIN) top = r.bottom + MARGIN
      if (top + PICKER_H + MARGIN > vh) top = Math.max(MARGIN, vh - PICKER_H - MARGIN)
      // 横: トリガーの左に揃え、右にはみ出すなら左へ寄せる
      let left = r.left
      if (left + PICKER_W + MARGIN > vw) left = vw - PICKER_W - MARGIN
      if (left < MARGIN) left = MARGIN
      setPos({ top, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!pos) return null

  return (
    <>
      {/* Backdrop: 全画面・クリックで閉じる */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      {/* Picker: fixed配置 */}
      <div
        className="fixed z-[70] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 w-60"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quick-pick row */}
        <div className="flex flex-wrap gap-0.5">
          {QUICK_EMOJIS.map(({ name, char }) => (
            <button
              key={name}
              onClick={() => { onSelect(name); onClose() }}
              className="text-xl hover:bg-gray-100 rounded-lg p-1.5 transition-colors leading-none"
              title={name}
            >
              {char}
            </button>
          ))}
        </div>

        {/* Custom emojis */}
        {customList.length > 0 && (
          <div className="border-t border-gray-100 mt-2 pt-2">
            <p className="text-[10px] text-gray-400 mb-1 px-1">カスタム絵文字</p>
            <div className="flex flex-wrap gap-0.5 max-h-28 overflow-y-auto">
              {customList.map(([name, url]) => (
                <button
                  key={name}
                  onClick={() => { onSelect(name); onClose() }}
                  className="hover:bg-gray-100 rounded-lg p-1 transition-colors"
                  title={name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={name} loading="lazy" decoding="async" width={24} height={24} className="w-6 h-6 object-contain" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

type AvatarMap = Record<string, string>
type UserInfoMap = Record<string, MemberInfo>
type UserBySlackId = Record<string, { displayName: string; avatarUrl: string | null }>

interface Props {
  messages: Message[]
  currentUserName: string
  currentSlackUserId?: string | null
  channelName?: string
  avatarMap?: AvatarMap
  userInfoMap?: UserInfoMap
  userBySlackId?: UserBySlackId
  hasMore?: boolean
  onLoadMore?: () => void
  reactionsMap?: ReactionsMap
  customEmojis?: CustomEmojis
  onAddReaction?: (msg: Message, reaction: string) => void
  onEditMessage?: (msgId: string, newContent: string) => void
  onDeleteMessage?: (msgId: string) => void
  onReplyMessage?: (msg: Message) => void
  replyingToId?: string | null
}

function formatUserList(users: string[]): string {
  if (users.length === 0) return ''
  if (users.length <= 3) return users.join('・')
  return `${users.slice(0, 3).join('・')} 他${users.length - 3}名`
}

function ReactionUsersModal({
  reaction,
  users,
  avatarMap,
  customEmojis,
  currentUserName,
  myReacted,
  onToggle,
  onClose,
}: {
  reaction: string
  users: string[]
  avatarMap?: Record<string, string>
  customEmojis?: CustomEmojis
  currentUserName: string
  myReacted: boolean
  onToggle: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl leading-none flex-shrink-0">{renderReaction(reaction, customEmojis)}</span>
            <h3 className="font-bold text-gray-900 truncate">にリアクションしたメンバー</h3>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            title="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {users.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">まだリアクションがありません</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {users.map((u) => {
                const av = avatarMap?.[u]
                const isMe = u === currentUserName
                return (
                  <li key={u} className="flex items-center gap-3 px-2 py-2">
                    {av ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={av} alt={u} className="w-9 h-9 rounded-lg object-cover" />
                    ) : (
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${getAvatarColor(u)}`}>
                        {u.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">{u}</span>
                    {isMe && (
                      <span className="text-[10px] text-accel-active bg-accel-lightest px-1.5 py-0.5 rounded-full">あなた</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {currentUserName && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => { onToggle(); onClose() }}
              className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
                myReacted
                  ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                  : 'bg-accel-active text-white hover:bg-accel-text'
              }`}
            >
              {myReacted ? 'リアクションを取り消す' : 'リアクションする'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ReactionChip({
  reaction,
  count,
  users,
  myReacted,
  onToggle,
  customEmojis,
  avatarMap,
  currentUserName,
}: {
  reaction: string
  count: number
  users: string[]
  myReacted: boolean
  onToggle: () => void
  customEmojis?: CustomEmojis
  avatarMap?: Record<string, string>
  currentUserName: string
}) {
  const [showTip, setShowTip] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }

  useEffect(() => () => clearTimers(), [])

  const handleTouchStart = () => {
    clearTimers()
    pressTimerRef.current = setTimeout(() => {
      setShowTip(true)
      hideTimerRef.current = setTimeout(() => setShowTip(false), 2500)
    }, 400)
  }

  const handleTouchEnd = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null }
  }

  return (
    <>
      <div className="relative inline-flex">
        <button
          onClick={() => { setShowTip(false); setShowModal(true) }}
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors ${
            myReacted
              ? 'bg-accel-lightest border border-accel-light hover:bg-accel-light'
              : 'bg-gray-100 hover:bg-gray-200 border border-transparent'
          }`}
          title={`${reaction} のリアクション詳細を表示`}
        >
          <span className="leading-none">{renderReaction(reaction, customEmojis)}</span>
          <span className="text-xs text-gray-600 font-medium">{count}</span>
        </button>
        {showTip && users.length > 0 && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-30 pointer-events-none">
            <div className="font-medium">{formatUserList(users)}</div>
            <div className="text-gray-300 text-[10px] mt-0.5">タップで全員を表示</div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        )}
      </div>
      {showModal && (
        <ReactionUsersModal
          reaction={reaction}
          users={users}
          avatarMap={avatarMap}
          customEmojis={customEmojis}
          currentUserName={currentUserName}
          myReacted={myReacted}
          onToggle={onToggle}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm')
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return '今日'
  if (isYesterday(date)) return '昨日'
  return format(date, 'yyyy年M月d日 (EEEE)', { locale: ja })
}

// Compare two ISO timestamp strings by unix time (handles tz/precision differences)
function sameTimestamp(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000
}

// reactionsMap キー正規化: PostgreSQL TIMESTAMPTZ の書式ゆれを epoch ms 文字列で統一
function tsKey(ts: string | null | undefined): string {
  if (!ts) return ''
  const t = new Date(ts).getTime()
  return Number.isFinite(t) ? String(t) : ts
}

function MessageBubble({
  msg,
  isContinuation,
  isOwn,
  reactions,
  threadReplies,
  avatarMap,
  userInfoMap,
  customEmojis,
  currentUserName,
  channelName,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onReply,
  onMemberClick,
  isReply = false,
  isReplying = false,
  currentSlackUserId,
  userBySlackId,
}: {
  msg: Message
  isContinuation: boolean
  isOwn: boolean
  reactions?: { reaction: string; count: number; users: string[] }[]
  threadReplies?: Message[]
  avatarMap?: AvatarMap
  userInfoMap?: UserInfoMap
  customEmojis?: CustomEmojis
  currentUserName: string
  channelName?: string
  onReact?: (reaction: string) => void
  onEditMessage?: (msgId: string, newContent: string) => void
  onDeleteMessage?: (msgId: string) => void
  onReply?: () => void
  onMemberClick?: (member: MemberInfo) => void
  isReply?: boolean
  isReplying?: boolean
  currentSlackUserId?: string | null
  userBySlackId?: UserBySlackId
}) {
  const [expanded, setExpanded] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(msg.content)
  const [saving, setSaving] = useState(false)
  const reactBtnRef = useRef<HTMLButtonElement>(null)
  const replyCount = threadReplies?.length ?? 0

  // 表示名・アバターを解決:
  // 1. msg.slack_user_id があれば users テーブル(slack_user_id 索引)を優先
  // 2. それで取れなければ msg.user_name / avatar_url / avatarMap[user_name] にフォールバック
  // → 新規メンバーで user_name が "U02XXX" のような ID 羅列でも、users テーブルに
  //   slack_user_id 行があれば正しい表示名・アバターが出る
  const userFromId = msg.slack_user_id ? userBySlackId?.[msg.slack_user_id] : undefined
  const displayName = userFromId?.displayName || msg.user_name
  const avatarUrl =
    userFromId?.avatarUrl ||
    msg.avatar_url ||
    avatarMap?.[displayName] ||
    avatarMap?.[msg.user_name]

  // 削除権限: slack_user_id 一致 OR user_name 一致 OR 管理者
  const ADMIN_SLACK_USER_ID = 'U058FM3EFE0'
  const sameSlackId = !!(currentSlackUserId && msg.slack_user_id && currentSlackUserId === msg.slack_user_id)
  const sameUserName = !!currentUserName && msg.user_name === currentUserName
  const isAdmin = !!currentSlackUserId && currentSlackUserId === ADMIN_SLACK_USER_ID
  const canDelete = sameSlackId || sameUserName || isAdmin

  // デバッグ: 削除権限判定の根拠を確認
  console.log('[MessageBubble] canDelete check', {
    msgId: msg.id,
    msgUserName: msg.user_name,
    msgSlackUserId: msg.slack_user_id ?? null,
    currentUserName,
    currentSlackUserId: currentSlackUserId ?? null,
    sameSlackId,
    sameUserName,
    isAdmin,
    canDelete,
  })

  const handleSaveEdit = async () => {
    const trimmed = editContent.trim()
    if (!trimmed) return
    if (trimmed === msg.content) { setIsEditing(false); return }
    setSaving(true)
    try {
      await fetch('/api/slack/message', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msg.id,
          channelName,
          messageCreatedAt: msg.created_at,
          content: trimmed,
          userName: currentUserName,
          slackUserId: currentSlackUserId ?? null,
        }),
      })
      onEditMessage?.(msg.id, trimmed)
      setIsEditing(false)
    } catch {
      alert('編集に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('このメッセージを削除しますか？')) return
    try {
      await fetch('/api/slack/message', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msg.id,
          channelName,
          messageCreatedAt: msg.created_at,
          userName: currentUserName,
          slackUserId: currentSlackUserId ?? null,
        }),
      })
      onDeleteMessage?.(msg.id)
    } catch {
      alert('削除に失敗しました')
    }
  }

  const memberInfo: MemberInfo = {
    displayName,
    avatarUrl: avatarUrl ?? null,
    slackUserId: msg.slack_user_id ?? userInfoMap?.[displayName]?.slackUserId ?? userInfoMap?.[msg.user_name]?.slackUserId ?? null,
  }

  return (
    <div className={`w-full px-2 md:px-3 py-2 ${isContinuation ? 'mt-0' : 'mt-2'} ${isReplying ? 'bg-accel-lightest/60' : 'hover:bg-gray-50'} ${isReply ? 'pl-3 md:pl-4' : ''} relative`}>
      {/* Row 1: アバター・名前・時刻 */}
      {!isContinuation && (
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => onMemberClick?.(memberInfo)}
            className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden focus:outline-none hover:ring-2 hover:ring-[#279300]/40 transition-all"
            title={displayName}
          >
            {avatarUrl && !avatarError ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={32}
                height={32}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${getAvatarColor(displayName)}`}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </button>
          <button
            onClick={() => onMemberClick?.(memberInfo)}
            className={`text-sm font-bold hover:underline focus:outline-none ${isOwn ? 'text-accel-active' : 'text-gray-900'}`}
          >
            {displayName}
          </button>
          <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
        </div>
      )}
      {isContinuation && (
        <div className="text-[10px] text-gray-400 mb-1">{formatTime(msg.created_at)}</div>
      )}

      {/* Row 2: メッセージ本文 (全幅・左余白なし) */}
      {isEditing ? (
        <div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setIsEditing(false) }}
            rows={Math.max(2, editContent.split('\n').length)}
            className="w-full text-[15px] text-gray-800 border border-accel-light rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accel-light resize-none"
            autoFocus
          />
          <div className="flex gap-2 mt-1.5 text-sm">
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editContent.trim()}
              className="px-3 py-1 bg-accel-active text-white rounded-lg hover:bg-accel-text transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => { setIsEditing(false); setEditContent(msg.content) }}
              className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full">
          {msg.content && (
            <p className="text-[15px] text-gray-800 leading-relaxed break-words whitespace-pre-wrap">
              {renderContent(msg.content, customEmojis)}
            </p>
          )}
          {msg.files_json && msg.files_json.length > 0 && (
            <FileAttachments files={msg.files_json} />
          )}
        </div>
      )}

      {/* Row 3: リアクション一覧 */}
      {reactions && reactions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {reactions.map(({ reaction, count, users }) => (
            <ReactionChip
              key={reaction}
              reaction={reaction}
              count={count}
              users={users}
              myReacted={users.includes(currentUserName)}
              onToggle={() => onReact?.(reaction)}
              customEmojis={customEmojis}
              avatarMap={avatarMap}
              currentUserName={currentUserName}
            />
          ))}
        </div>
      )}

      {/* Row 4: アクションボタン (常時表示・PC/スマホ共通) */}
      {!isEditing && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {onReact && (
            <>
              <button
                ref={reactBtnRef}
                onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v) }}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                title="リアクションを追加"
              >
                <Smile size={14} />
                <span>リアクション</span>
              </button>
              {showPicker && reactBtnRef.current && (
                <EmojiPicker
                  anchor={reactBtnRef.current}
                  onSelect={(reaction) => onReact(reaction)}
                  onClose={() => setShowPicker(false)}
                  customEmojis={customEmojis}
                />
              )}
            </>
          )}
          {!isReply && onReply && (
            <button
              onClick={onReply}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-accel-active hover:bg-accel-text text-white rounded-lg text-xs font-medium transition-colors"
              title="スレッドで返信"
            >
              <span aria-hidden>💬</span>
              <span>返信</span>
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => { setIsEditing(true); setEditContent(msg.content) }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
              title="編集"
            >
              <Pencil size={12} />
              <span>編集</span>
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-medium transition-colors"
              title="削除"
            >
              <span aria-hidden>🗑️</span>
              <span>削除</span>
            </button>
          )}
        </div>
      )}

      {/* スレッド返信表示 (Slack風) */}
      {!isReply && replyCount > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-transparent hover:border-gray-200 hover:bg-white transition-colors group/thread"
          >
            <div className="flex -space-x-1.5">
              {Array.from(new Set(threadReplies!.map((r) => r.user_name))).slice(0, 3).map((name) => {
                const av = avatarMap?.[name]
                return av ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={name}
                    src={av}
                    alt={name}
                    className="w-5 h-5 rounded-md border border-white object-cover"
                  />
                ) : (
                  <div key={name} className={`w-5 h-5 rounded-md border border-white flex items-center justify-center text-[10px] text-white font-bold ${getAvatarColor(name)}`}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                )
              })}
            </div>
            <span className="text-xs font-bold text-accel-active group-hover/thread:underline">
              {replyCount}件の返信
            </span>
            <span className="text-[11px] text-gray-500">
              最終返信 {formatTime(threadReplies![threadReplies!.length - 1].created_at)}
            </span>
            <span className="text-[11px] text-gray-400">{expanded ? '閉じる ▲' : 'スレッドを開く ▼'}</span>
          </button>

          {expanded && (
            <div className="mt-2 ml-1 border-l-2 border-accel-light bg-gray-50/60 rounded-r-lg py-2">
              {threadReplies!.map((reply, idx) => {
                const prevReply = threadReplies![idx - 1]
                const isContReply =
                  prevReply &&
                  prevReply.user_name === reply.user_name &&
                  new Date(reply.created_at).getTime() - new Date(prevReply.created_at).getTime() < 5 * 60 * 1000
                return (
                  <MessageBubble
                    key={reply.id}
                    msg={reply}
                    isContinuation={isContReply}
                    isOwn={reply.user_name === currentUserName}
                    reactions={[]}
                    avatarMap={avatarMap}
                    userInfoMap={userInfoMap}
                    userBySlackId={userBySlackId}
                    customEmojis={customEmojis}
                    currentUserName={currentUserName}
                    currentSlackUserId={currentSlackUserId}
                    onMemberClick={onMemberClick}
                    isReply
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MessageList({ messages, currentUserName, currentSlackUserId, channelName, avatarMap, userInfoMap, userBySlackId, hasMore, onLoadMore, reactionsMap, customEmojis, onAddReaction, onEditMessage, onDeleteMessage, onReplyMessage, replyingToId }: Props) {
  // デバッグ: 現在ログイン中のユーザー識別子を1度だけ出力
  useEffect(() => {
    console.log('[MessageList] current user:', { currentUserName, currentSlackUserId: currentSlackUserId ?? null })
  }, [currentUserName, currentSlackUserId])
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(0)
  const prevScrollHeightRef = useRef(0)
  const isLoadingMoreRef = useRef(false)
  const [newCount, setNewCount] = useState(0)
  const [memberPopup, setMemberPopup] = useState<MemberInfo | null>(null)

  const handleMemberClick = useCallback((member: MemberInfo) => {
    setMemberPopup(member)
  }, [])

  // スレッド構造を計算: top-levelとreplyに分離
  const { topLevelMessages, threadMap } = useMemo(() => {
    const topLevel: Message[] = []
    const map = new Map<number, Message[]>()

    for (const msg of messages) {
      const isReply =
        msg.thread_ts != null &&
        !sameTimestamp(msg.thread_ts, msg.created_at)

      if (isReply) {
        const parentMs = new Date(msg.thread_ts!).getTime()
        if (!map.has(parentMs)) map.set(parentMs, [])
        map.get(parentMs)!.push(msg)
      } else {
        topLevel.push(msg)
      }
    }

    return { topLevelMessages: topLevel, threadMap: map }
  }, [messages])

  // スクロール位置が下端付近か判定（150px 以内）
  const isNearBottom = () => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150
  }

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    // 「もっと読み込む」後: スクロール位置を維持
    if (isLoadingMoreRef.current) {
      isLoadingMoreRef.current = false
      if (scrollContainerRef.current) {
        const newScrollHeight = scrollContainerRef.current.scrollHeight
        scrollContainerRef.current.scrollTop = newScrollHeight - prevScrollHeightRef.current
      }
      prevLengthRef.current = topLevelMessages.length
      return
    }

    const prev = prevLengthRef.current
    const curr = topLevelMessages.length
    prevLengthRef.current = curr

    if (prev === 0) {
      // 初回ロード / チャンネル切替: 即座に一番下へ
      scrollToBottom('instant')
      setNewCount(0)
      return
    }

    if (curr > prev) {
      // 新着メッセージ
      if (isNearBottom()) {
        scrollToBottom('smooth')
        setNewCount(0)
      } else {
        setNewCount((n) => n + (curr - prev))
      }
    }
  }, [topLevelMessages])

  const handleLoadMore = () => {
    if (scrollContainerRef.current) {
      prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight
    }
    isLoadingMoreRef.current = true
    onLoadMore?.()
  }

  const handleScrollToNew = () => {
    scrollToBottom('smooth')
    setNewCount(0)
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-5xl mb-4">💬</div>
          <p className="text-lg font-medium text-gray-500">まだメッセージがありません</p>
          <p className="text-sm mt-1">最初のメッセージを送ってみましょう</p>
        </div>
      </div>
    )
  }

  // 日付ごとにグループ化（top-levelのみ）
  const groupedMessages: { date: string; messages: Message[] }[] = []
  topLevelMessages.forEach((msg) => {
    const msgDate = new Date(msg.created_at)
    const lastGroup = groupedMessages[groupedMessages.length - 1]
    if (lastGroup && isSameDay(new Date(lastGroup.date), msgDate)) {
      lastGroup.messages.push(msg)
    } else {
      groupedMessages.push({ date: msg.created_at, messages: [msg] })
    }
  })

  return (
    <div className="flex-1 min-h-0 relative flex flex-col">
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto message-scrollbar"
        onScroll={() => {
          if (isNearBottom()) setNewCount(0)
        }}
      >
        <div className="py-4">
          {hasMore && (
            <div className="flex justify-center py-3">
              <button
                onClick={handleLoadMore}
                className="px-4 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                もっと読み込む
              </button>
            </div>
          )}
          {groupedMessages.map((group, groupIdx) => (
            <div key={groupIdx}>
              {/* 日付セパレーター */}
              <div className="flex items-center gap-3 px-2 md:px-6 my-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-medium text-gray-500 px-2 py-0.5 bg-white border border-gray-200 rounded-full whitespace-nowrap">
                  {formatDateSeparator(group.date)}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {group.messages.map((msg, msgIdx) => {
                const isOwn = msg.user_name === currentUserName
                const prevMsg = group.messages[msgIdx - 1]
                const isContinuation =
                  prevMsg &&
                  prevMsg.user_name === msg.user_name &&
                  new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000

                const msgTimeMs = new Date(msg.created_at).getTime()
                const threadReplies = threadMap.get(msgTimeMs)
                const reactions = reactionsMap?.[tsKey(msg.created_at)]

                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isContinuation={!!isContinuation}
                    isOwn={isOwn}
                    reactions={reactions}
                    threadReplies={threadReplies}
                    avatarMap={avatarMap}
                    userInfoMap={userInfoMap}
                    userBySlackId={userBySlackId}
                    customEmojis={customEmojis}
                    currentUserName={currentUserName}
                    currentSlackUserId={currentSlackUserId}
                    channelName={channelName}
                    onReact={onAddReaction ? (reaction) => onAddReaction(msg, reaction) : undefined}
                    onEditMessage={onEditMessage}
                    onDeleteMessage={onDeleteMessage}
                    onReply={onReplyMessage ? () => onReplyMessage(msg) : undefined}
                    onMemberClick={handleMemberClick}
                    isReplying={replyingToId === msg.id}
                  />
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 新着メッセージボタン */}
      {newCount > 0 && (
        <button
          onClick={handleScrollToNew}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 bg-accel-active hover:bg-accel-text text-white text-sm font-medium rounded-full shadow-lg transition-colors z-10"
        >
          ↓ {newCount}件の新着メッセージ
        </button>
      )}

      {memberPopup && (
        <MemberPopup member={memberPopup} onClose={() => setMemberPopup(null)} />
      )}
    </div>
  )
}
