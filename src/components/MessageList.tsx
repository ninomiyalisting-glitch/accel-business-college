'use client'

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { MessageSquare, Smile, Pencil, Trash2 } from 'lucide-react'
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
  if (url) return <img src={url} alt={reaction} title={reaction} className="inline-block w-4 h-4 object-contain align-middle" />
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
        <span key={i} className="text-purple-700 bg-purple-50 rounded px-0.5 font-medium">
          @{name}
        </span>
      )
    }

    // Special mentions: <!channel>, <!here>, <!everyone>
    if (part === '<!channel>' || part === '<!here>' || part === '<!everyone>') {
      return (
        <span key={i} className="text-purple-700 bg-purple-50 rounded px-0.5 font-medium">
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
           className="text-blue-600 hover:underline break-all">
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
          <img key={i} src={url} alt={name} title={name} className="inline-block w-5 h-5 object-contain align-middle mx-0.5" />
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

// Emoji picker popup
function EmojiPicker({
  onSelect,
  onClose,
  customEmojis,
}: {
  onSelect: (reaction: string) => void
  onClose: () => void
  customEmojis?: CustomEmojis
}) {
  const customList = Object.entries(customEmojis ?? {}).slice(0, 40)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      {/* Picker */}
      <div
        className="absolute bottom-full right-0 z-30 bg-white rounded-xl shadow-xl border border-gray-200 p-2 mb-1 w-60"
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
                  <img src={url} alt={name} className="w-6 h-6 object-contain" />
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

interface Props {
  messages: Message[]
  currentUserName: string
  channelName?: string
  avatarMap?: AvatarMap
  userInfoMap?: UserInfoMap
  hasMore?: boolean
  onLoadMore?: () => void
  reactionsMap?: ReactionsMap
  customEmojis?: CustomEmojis
  onAddReaction?: (msg: Message, reaction: string) => void
  onEditMessage?: (msgId: string, newContent: string) => void
  onDeleteMessage?: (msgId: string) => void
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
  onMemberClick,
  isReply = false,
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
  onMemberClick?: (member: MemberInfo) => void
  isReply?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(msg.content)
  const [saving, setSaving] = useState(false)
  const replyCount = threadReplies?.length ?? 0
  const avatarUrl = msg.avatar_url || avatarMap?.[msg.user_name]

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
        }),
      })
      onDeleteMessage?.(msg.id)
    } catch {
      alert('削除に失敗しました')
    }
  }

  return (
    <div className={`flex gap-3 px-6 py-1 hover:bg-gray-50 group ${isContinuation ? 'mt-0' : 'mt-3'} ${isReply ? 'pl-14 pr-6' : ''} relative`}>
      {/* アバター */}
      <div className="flex-shrink-0 w-9">
        {!isContinuation ? (
          <button
            onClick={() => onMemberClick?.({
              displayName: msg.user_name,
              avatarUrl: avatarUrl ?? null,
              slackUserId: userInfoMap?.[msg.user_name]?.slackUserId ?? null,
            })}
            className="block w-9 h-9 rounded-lg overflow-hidden focus:outline-none hover:ring-2 hover:ring-[#2563eb]/40 transition-all"
            title={msg.user_name}
          >
            {avatarUrl && !avatarError ? (
              <Image
                src={avatarUrl}
                alt={msg.user_name}
                width={36}
                height={36}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${getAvatarColor(msg.user_name)}`}>
                {msg.user_name.charAt(0).toUpperCase()}
              </div>
            )}
          </button>
        ) : (
          <div className="w-9 h-5 flex items-center justify-center">
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatTime(msg.created_at)}
            </span>
          </div>
        )}
      </div>

      {/* メッセージ内容 */}
      <div className="flex-1 min-w-0">
        {!isContinuation && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <button
              onClick={() => onMemberClick?.({
                displayName: msg.user_name,
                avatarUrl: avatarUrl ?? null,
                slackUserId: userInfoMap?.[msg.user_name]?.slackUserId ?? null,
              })}
              className={`text-sm font-bold hover:underline focus:outline-none ${isOwn ? 'text-purple-700' : 'text-gray-900'}`}
            >
              {msg.user_name}
            </button>
            <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
          </div>
        )}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setIsEditing(false) }}
              rows={Math.max(2, editContent.split('\n').length)}
              className="w-full text-[15px] text-gray-800 border border-purple-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none"
              autoFocus
            />
            <div className="flex gap-2 mt-1.5 text-sm">
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editContent.trim()}
                className="px-3 py-1 bg-purple-700 text-white rounded-lg hover:bg-purple-800 transition-colors disabled:opacity-50"
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
          <>
            {msg.content && (
              <p className="text-[15px] text-gray-800 leading-relaxed break-words whitespace-pre-wrap">
                {renderContent(msg.content, customEmojis)}
              </p>
            )}
            {msg.files_json && msg.files_json.length > 0 && (
              <FileAttachments files={msg.files_json} />
            )}
          </>
        )}

        {/* リアクション一覧 */}
        {reactions && reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {reactions.map(({ reaction, count, users }) => {
              const myReacted = users.includes(currentUserName)
              return (
                <button
                  key={reaction}
                  onClick={() => onReact?.(reaction)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors ${
                    myReacted
                      ? 'bg-purple-100 border border-purple-300 hover:bg-purple-200'
                      : 'bg-gray-100 hover:bg-gray-200 border border-transparent'
                  }`}
                  title={`${reaction}${myReacted ? ' (取り消す)' : ''}`}
                >
                  <span className="leading-none">{renderReaction(reaction, customEmojis)}</span>
                  <span className="text-xs text-gray-600 font-medium">{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* スレッド返信ボタン */}
        {!isReply && replyCount > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              <MessageSquare size={14} />
              {replyCount}件の返信
              <span className="text-xs text-gray-400">{expanded ? '▲ 閉じる' : '▼ 開く'}</span>
            </button>

            {expanded && (
              <div className="mt-2 border-l-2 border-gray-200 pl-3 space-y-1">
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
                      customEmojis={customEmojis}
                      currentUserName={currentUserName}
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

      {/* アクションボタンエリア */}
      {!isReply && !isEditing && (
        <div className="flex-shrink-0 self-start mt-0.5 flex items-center gap-0.5">
          {/* 編集・削除（自分のメッセージのみ） */}
          {isOwn && (
            <>
              {/* Desktop: hover only */}
              <button
                onClick={() => { setIsEditing(true); setEditContent(msg.content) }}
                className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                title="編集"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={handleDelete}
                className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500"
                title="削除"
              >
                <Trash2 size={14} />
              </button>
              {/* Mobile: always visible */}
              <button
                onClick={() => { setIsEditing(true); setEditContent(msg.content) }}
                className="flex md:hidden p-1.5 rounded-lg text-gray-300 active:bg-gray-200"
                title="編集"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={handleDelete}
                className="flex md:hidden p-1.5 rounded-lg text-gray-300 active:bg-red-100"
                title="削除"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}

          {/* リアクションボタン */}
          {onReact && (
            <div className="relative">
              {/* Desktop: hover only */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v) }}
                className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                title="リアクションを追加"
              >
                <Smile size={16} />
              </button>
              {/* Mobile: always visible */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v) }}
                className="flex md:hidden p-1.5 rounded-lg text-gray-300 active:bg-gray-200"
                title="リアクションを追加"
              >
                <Smile size={14} />
              </button>

              {showPicker && (
                <EmojiPicker
                  onSelect={(reaction) => onReact(reaction)}
                  onClose={() => setShowPicker(false)}
                  customEmojis={customEmojis}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MessageList({ messages, currentUserName, channelName, avatarMap, userInfoMap, hasMore, onLoadMore, reactionsMap, customEmojis, onAddReaction, onEditMessage, onDeleteMessage }: Props) {
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
              <div className="flex items-center gap-3 px-6 my-4">
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
                const reactions = reactionsMap?.[msg.created_at]

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
                    customEmojis={customEmojis}
                    currentUserName={currentUserName}
                    channelName={channelName}
                    onReact={onAddReaction ? (reaction) => onAddReaction(msg, reaction) : undefined}
                    onEditMessage={onEditMessage}
                    onDeleteMessage={onDeleteMessage}
                    onMemberClick={handleMemberClick}
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
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-sm font-medium rounded-full shadow-lg transition-colors z-10"
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
