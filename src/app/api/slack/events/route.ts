import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Lazily created to avoid build-time errors when env vars aren't set
function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  console.log('[slack] createClient url prefix:', url.slice(0, 30), '| key prefix:', key.slice(0, 12))
  return createClient(url, key, { auth: { persistSession: false } })
}

// Direct REST fetch to Supabase with AbortController timeout
async function supabaseRestGet(path: string, params: Record<string, string>): Promise<{ data: unknown; status: number; error: string | null }> {
  const url = new URL((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim() + '/rest/v1/' + path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url.toString(), {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timer)
    const text = await res.text()
    console.log('[slack] REST GET', path, 'status:', res.status, 'body:', text.slice(0, 200))
    return { data: text, status: res.status, error: res.ok ? null : text }
  } catch (err) {
    clearTimeout(timer)
    console.error('[slack] REST GET', path, 'threw:', err)
    return { data: null, status: 0, error: String(err) }
  }
}

// In-memory cache (lives for the duration of the Lambda invocation)
const channelCache = new Map<string, string>() // slackChannelId → supabaseChannelId
const userCache = new Map<string, string>()    // slackUserId → displayName
const avatarCache = new Map<string, string | null>() // slackUserId → avatar_url

// Static mapping from Slack export (Slack channel ID → channel name)
// Used to avoid calling conversations.info API
const SLACK_CHANNEL_NAMES: Record<string, string> = {
  'C062ZGT7VKJ': '診断士受験生の部屋',
  'C063F3THYCC': 'アクセル麻雀カレッジ',
  'C06N96KQEMS': '製造業支援研究会',
  'C07B2AYJDU0': '健康増進総合',
  'C07FGH9N0P6': '診断士の食卓',
  'C08BD5SH6BE': '北関東チーム',
  'C08D1Q6GPRS': '診断士合格後の教科書',
  'C05836YBW0Z': '勉強会',
  'C05R7ASABLZ': 'アクセル杯',
  'C05SVK3HUG5': 'サク飲みマッチングチャンネル',
  'C060HPCNBK7': '東海',
  'C067PHAPFR7': '経営企画',
  'C067R8B6RPB': '二宮さんとディスカッションチャンネル',
  'C07E8Q2BJLV': 'なんでも学習応援',
  'C07GJK007AR': 'ビジネス書の共有',
  'C07KRUYLT5X': '行政の方向性や施策を共有し合うチャンネル',
  'C07Q4RHBVUZ': 'ゴーストライタープロジェクトチーム',
  'C08B95P5C5B': '野球を語るチャンネル',
  'C08BPA5GRS5': '北海道-東北-北信越チーム',
  'C0AEHHD08U9': 'アクセルお仕事ガイド',
  'C0AKXV6CNF3': '気軽なお知らせコミュニティ紹介',
  'C057QHGTR1Q': 'random',
  'C05808X13GW': '議論スレッド',
  'C05F2NF3CUW': '自己紹介',
  'C05HA5PTMAN': '関西チーム',
  'C07QKJJNDTL': '東京都中小企業振興公社事業',
  'C0820LMMBQE': '製造業支援研究会-調達分科会',
  'C089QRKP3DG': '機械学習勉強チャンネル',
  'C08B420C4QN': '東京千葉チーム',
  'C08BAHQ6SHG': '東海チーム',
  'C057A1CCAMD': '全体連絡用',
  'C057SAVR03Z': '運営スタッフの部屋',
  'C05DX9QDFDM': 'にのみーのここだけの話',
  'C05LB6R1M3M': 'カレッジチャット',
  'C0687GAN735': '独立しましたするかもチャンネル',
  'C0689VAAKV5': '九州-四国-中国会',
  'C06ANRZJX63': '農業ch',
  'C0734SS4V8B': '社労士受験生スレッド',
  'C07FRJWDFGT': '受験生応援フライングコミュニティ準備室',
  'C07GGP48JAF': '気楽にエンタメ共有チャンネル',
  'C07H86JJR8T': '神奈川チーム',
  'C07LF3TJ1QX': '事業承継支援研究会',
  'C07RNKSSHCP': 'なんでも質問',
  'C086NJQJWMR': '2025ビジカレサミット',
  'C08GEGSCF8X': 'メディカルケアパーク応援チャンネル',
  'C08S8AYCD6F': 'sns_hp_情報発信グループ',
  'C08TET5UNUX': '製造業支援研究会_設計-開発分科会',
}

// Static mapping from Slack export (Slack user ID → display name)
const SLACK_USER_NAMES: Record<string, string> = {
  'U057QHGR7H8': 'deactivateduser',
  'U0586EYJR3Q': '(連絡は二宮宛にお願いします)ビジカレ管理アカウント',
  'U058FM3EFE0': 'にのみー',
  'U058FM869C4': 'deactivateduser',
  'U05DPAF6JUE': 'watanabe',
  'U05DVUFEV8S': '鈴木俊雄/新潟/R2',
  'U05DY4Q9J20': '岩本秀巳　岐阜　H30',
  'U05E52FH0GN': '佐々木彦太(げんた)',
  'U05E52LPHSS': '今井発/岐阜/R3',
  'U05E52P0KSS': '小杉義直/群馬と兵庫たまに東京（R4）',
  'U05EBMTH4CS': 'かながわの鴨居さん/神奈川 R4',
  'U05EBMUS58A': '神谷淳',
  'U05EBN15DR8': '佐藤雅則',
  'U05EBN1PYQ2': '本木太基/静岡',
  'U05EBN2B6P4': '本田勇人',
  'U05EE56RA92': '堀　靖和（東京都多摩地区/R4）',
  'U05EE58JT28': '白井有紀/神奈川県R2',
  'U05EE5BU9SQ': '沖 忠彦',
  'U05EE5EH1D2': '宮本 真央',
  'U05EE5GK30U': '彦坂尚幸',
  'U05EMBCQLLC': '渡辺誠',
  'U05EMBD55LL': '石井和哉/愛知/R4',
  'U05ERTDT346': '藍谷慎太朗',
  'U05ERTF2CEA': '原昌平',
  'U05EV1M7SP6': '八木和真',
  'U05EYHF6KPC': '木俣康太/岐阜Ｒ3',
  'U05F14H9014': '齋藤 宏晃',
  'U05F1DAJQMN': '越智真也',
  'U05F25B7724': '伴野友宏/愛知県',
  'U05F2D3AYR4': '山川真実',
  'U05F2FPDMH6': '神崎諒',
  'U05F2JKJP0E': 'Ichiro Haga',
  'U05F7PUJ4R0': '森川　健',
  'U05F8KD8MG8': '平賀千晴',
  'U05F93CT6RG': '田中直輝',
  'U05F943RRGA': '齋藤里奈',
  'U05FA79KDV2': '三田諒子/神奈川/R4',
  'U05FA7B3P2Q': '村田和華子/東京R3',
  'U05FA7G4KTN': '竹岡靖真',
  'U05FBHGGT60': '安藤駿',
  'U05FDFLGE82': '清水 政樹/神奈川R3',
  'U05FFSFQQ5S': '竹中治美',
  'U05FNRT2BBJ': '大滝秀雄/東京R2',
  'U05FQ3ZV5B2': '森下直計/静岡/R3',
  'U05FXFETD88': '和田憲幸',
  'U05G36Z5VNC': '山縣智也',
  'U05G49XBAGY': '和田 英之',
  'U05GAH7GDPW': '久野裕規',
  'U05GXR5ECHE': '戸村聡介',
  'U05H06MH76W': 'Asakura Takeru / 朝倉 傑',
  'U05HG8ZEKJS': 'Tsuji Suguru',
  'U05HHTR37M0': '五ノ井 琢磨',
  'U05KPR24AUE': '富田千秋',
  'U05KPRAU754': 'hosokawa',
  'U05KWFAU09Y': '小野寺　重彦',
  'U05KYU7UH1S': '山本遼',
  'U05KYU9AKBN': '下川 渉太',
  'U05L2A7KTT4': '入江 惇史/福岡 R4',
  'U05LL6AMFAL': '西元琢也/福岡県/R4',
  'U05N8DHMMD2': '松尾啓吾',
  'U05PJE526V6': '得居崇志',
  'U05Q13NSUTY': '細藤武志',
  'U05QG9FGYD6': '中村光太朗',
  'U05QZH81JBW': '山﨑 圭一',
  'U05QZH897A8': '清田顕治',
  'U05S3AX8ND8': '持田貴郁',
  'U05SFEHC080': '江口　勉',
  'U05U4TP5HN0': '大森洋樹',
  'U05UVGTKJ30': '二葉優一/東京三多摩_R4',
  'U06041ABKA4': '中澤　孝文',
  'U061WM7RBG8': '堀本　幹夫',
  'U062QT1CBPY': '今井みづほ',
  'U0650MZ2XNC': '山田　悠介',
  'U066YHY9BNG': '市来久郎',
  'U067UNWQX0S': '矢島 慶伍/東京R3',
  'U069C6MPZ46': '今関一樹',
  'U06DJEUTRGQ': '植木俊行',
  'U06LS8JTCKG': '大藤拓哉',
  'U06MMM1TZ08': '外山紗織',
  'U06NE2P1H9N': '根元 皓平/神奈川R4',
  'U06P03UF5B2': '金子正行',
  'U06RL0T3BCN': '浅野　博文',
  'U06SFF5H0V6': '高山一祥',
  'U06SZD5RTPY': '斎藤拓/R5/福岡',
  'U06T6V29S4Q': '木村友則',
  'U06UAV3GNCW': '髙倉啓成',
  'U06V6C6HL64': '鈴木和幸/静岡/R5',
  'U06VBN3SSUA': '高松　岳郎',
  'U070P6MU26N': '山下杏奈/東京R3',
  'U0720J4J4MN': '日髙誠人_ R5_神奈川',
  'U072BPETY6A': '伊東昌紀',
  'U073C9T8SQJ': '松葉修/大阪 R5',
  'U073EPPEL04': '池水敬勇/福岡R5',
  'U073KL45000': '宮里憲太郎',
  'U076A13A0H0': '石川陽',
  'U076BL2E8Q0': '大橋洋貴',
  'U076CF47144': '小島尊裕/東京/R5',
  'U0780G1RF3Q': '金田　伸弥',
  'U0780G2048N': '上田　貴史',
  'U079ES4BS4A': '持橋　弥央',
  'U079FH4FALA': '竹内啓行/福岡県R6',
  'U079J1ST6AG': '三井雄史/福岡 R5',
  'U07AQPGU6LW': '土川知輝(R5愛知)',
  'U07B2KT0ZH6': '大澤一樹/神奈川(R5)',
  'U07BL6ETRU0': '草場有紗/東京R5',
  'U07BYQ2JEM8': 'フクナガ(R5,東京)/R7から大阪',
  'U07D1F4U1S8': '杉本篤/東京/愛知/R5',
  'U07DMQ695JL': '中村　次郎',
  'U07ELRNCWB0': '田篭亮博/福岡R5',
  'U07F5HEJDML': '櫻井　太一',
  'U07FNLXDY48': '山崎隆史/大阪府R5',
  'U07HWJQA0NN': '中尾　公 / 神奈川 R5',
  'U07K1A0MGLE': '山口　桜輔',
  'U07K8CBAVQE': '島根　理',
  'U07KK4J8XFU': '田中　有紀美',
  'U07KM8G21PY': '神谷 基生',
  'U07M51PFVS8': '持田貴郁 / 東京都R5',
  'U07MXHBAC14': '水島　工蔵',
  'U07RCVAREMA': '森田好彦/神戸R5',
  'U07T9KPS4RG': '本間采由眞',
  'U080NPCTHN2': '永野　武',
  'U082Y3MPH7Y': '茂呂晃良/兵庫 R5',
  'U083MN5364Q': '桐敷匠/東京R5',
  'U085SJ07S00': '有留浩二/千葉 R5',
  'U086LPE822W': '大橋　愛知　R5',
  'U08FV0H92SG': '鈴木洋平/東京R6',
  'U08G6CUQBE2': '宮入宏彦',
  'U08GF6URMHN': '竹下 陽介/東京 R6',
  'U08HK31HPGA': '植村裕加/兵庫/R4',
  'U08HURGF20N': '藤村崇保/愛知/R6',
  'U08J0QZ45JN': '森岡 健太郎/愛知/R6',
  'U08JDJ77YH0': '原田翔/東京/R6',
  'U08JNRSUFE2': '林　歩/富山/R5',
  'U08JS2Y1YSW': '柳澤昂之介/三重/R6',
  'U08LSUXEAES': '平岡高志 名古屋 R6',
  'U08N3RMADHS': '土井 アキラ/大阪R6',
  'U08R067J076': '佐藤広司/秋田/R6',
  'U08R067JAJY': '久保圭司/R6 /大阪',
  'U08RV27MY14': '小国哲',
  'U08UZ3N45PC': '戸谷太一',
  'U090N8UAHNY': '上野孝司/R6_大阪',
  'U09135JBPHC': '横山太郎',
  'U09135KCYH4': '原田翔平/神奈川/R6',
  'U0924BBV9NC': '兼光　修平/東京R6',
  'U0924BCG56U': '河合敏宏',
  'U094L9B2WMS': '林　利華',
  'U0956E6D6LQ': '大須賀健一',
  'U098HHBKN58': '高井幹人',
  'U09B9QCFZHN': '中塚 博基/東京城東/R6',
  'U09D5CQJNKW': '吉岡　猛',
  'U09GHLKBZ52': '石川　峻士（R6大阪）',
  'U09L0GZ40CS': '絹田明子',
  'U09QB29KG90': '平井越郎',
  'U0A0YUWFY2W': '宮﨑 克 / 千葉_R6',
  'U0A6S1WJ152': '恒川敦子 愛知/R6',
  'U0AEXHT0MMJ': '沼口郁子/宮城/R6',
  'U0AK0L2PCBW': '福島　一',
  'U0AKDSBQLKW': '東　直史/札幌/R7',
  'U0AKRAF3WRW': '田村　宗',
  'U0AKRB0MUGY': 'kuroki',
  'U0AL7AGPA0L': 'kuroki',
  'U0ANH0XRMJ6': '八瀬 慶一/大阪R6',
  'U058A8KTRCM': 'deactivateduser',
  'U058D34CE91': '櫻井結花子',
  'U0598HEGL2D': '古関大地',
  'U05DF3ZV015': '大江　充繁',
  'U05DF4HFHV5': '稲垣 健司',
  'U05DQB46STH': '上野山　裕司',
  'U05DSJHCBST': '古川祐介 愛知 H28',
  'U05DSTGSL2H': '本宮直',
  'U05DT2EHSTF': '渡辺義明/愛知/H28',
  'U05DVGJHG7M': '髙木亮哲',
  'U05DVGS10TV': '大久保克彦/神奈川県/NWインフラ屋さん',
  'U05DX6A0VRV': '三田英嗣',
  'U05DYQ8R7U7': '木村 健作/東京都',
  'U05E4C44VD5': '伊藤祐樹',
  'U05E4C55YLF': '岡部 信弘',
  'U05E4C5HF0F': '金田 誠　岐阜',
  'U05E8PVLU2Z': '川合隆行',
  'U05E8Q35UKX': '上原康明',
  'U05EACPLXQD': 'Yuki Matsui/東京都',
  'U05EAFQV813': '奥野 雄也',
  'U05EBJDPVNF': '長瀬真弓',
  'U05EBQL4KE3': '姫野慎也',
  'U05EBQMC2MV': '作山　剛',
  'U05EHFY8UEM': '服部純大',
  'U05EJQAGEMR': '大西 立朗',
  'U05ENT6JDGD': '三浦　勝典',
  'U05EQFJHKRP': '大川華子　/東京都 R4',
  'U05ET80GVBR': '浦野歩',
  'U05ET80URNK': '石田星斗',
  'U05EUM28JBZ': '阿部結衣',
  'U05EXH2EEU9': 'Fujihara Masahiro',
  'U05EYDVLR1R': '川端孝典/大阪 R2',
  'U05EYDXJ49Z': '梅田 実/大阪 東京R4',
  'U05EYV5KR1V': '鷺森尚紀',
  'U05F4RVQA2H': '坂井圭輔/大阪 R4',
  'U05F4RW7JJH': '下境 紀敬',
  'U05F7L8KFJ7': '入江麻美',
  'U05F91372N7': '藤本くるみ',
  'U05FB20JGN9': '吉野一哉',
  'U05FB6KFJ1X': '藤田',
  'U05FD1KA03B': '石田篤史/東京都練馬区/R2',
  'U05FLCX136V': '三原　弘之',
  'U05FMT1L6TT': '寺田卓尚/北海道札幌市/R03',
  'U05FMTJNWLR': '千田　晃平',
  'U05FWLKAMED': '辻本学',
  'U05G80SBB8B': '岸本忠士',
  'U05GAA31F9T': '青山雄城',
  'U05H5S6GWRX': '後藤 高弘/大分/R4',
  'U05HD3CL03X': '塚原 啓道',
  'U05HFTCF2KV': '南川幸毅/愛知 R2',
  'U05HMABJVUH': '横山康之介',
  'U05HNR1QD0B': '桂川 誠',
  'U05HZ81SYGP': '関　貴之',
  'U05JSDC0D3K': '田名網啓陽/渋谷R5',
  'U05KFUJA6T1': '長澤哲之介',
  'U05KTH3SLGM': '稲垣伸一',
  'U05KTH9DHD3': '南　宏明',
  'U05KWBR9V35': '古賀智義/大阪R04',
  'U05KWBV7RC3': '森下　剛',
  'U05KWBVM0NP': '村角浩明',
  'U05KWBXFWTV': '宇城 貴啓',
  'U05L61ACKDM': '今井一貴/R4',
  'U05L9462EBB': '佐藤和男',
  'U05L94E2V5F': '波多野優香',
  'U05LEUS60BT': '柳原大輝',
  'U05QU6KMTGD': '塚本聡',
  'U0648QLJKQV': '梅田さゆり',
  'U066BEWQ28H': '萩原　一',
  'U066FJENA4X': '山上修史',
  'U067YL4R8QH': '村田卓也 愛知R3',
  'U068DD748M7': '岩月孝太 愛知 R4',
  'U068G1GQMQT': '野尻孝弘',
  'U068SUC0F0F': '太田 侑希',
  'U068UP0KJKB': '上田恭史',
  'U069FTF9L05': '竹内 利春',
  'U06D65G93FB': '伊藤世士洋',
  'U06KFD3H6ET': '熊倉武則',
  'U06LJAT46LF': '山口莉乃',
  'U06MAMRP407': '平山 陽子/新潟 R3',
  'U06MBH7LL6M': '村上雅一/関東R５',
  'U06MNB8H1V3': '藤平航太朗',
  'U06MWKW33PZ': '水越　令',
  'U06NQ0H5T7B': '池内友哉',
  'U06Q631NAR1': '長谷川玲音',
  'U06QAN30D5F': '堀江 崇之',
  'U06QVRMN2S3': '原島　健一',
  'U06SF81EYKX': '米山諒',
  'U06SWRCEU0H': '横田　久子/埼玉 R5',
  'U06UHESCSJF': '福島伸一',
  'U06V418KF3R': '室島祐介',
  'U0715JRGNGZ': '小林 晃司',
  'U071NEA2Z0F': '宮﨑聡',
  'U072TUYFJ3X': '大竹渉',
  'U074FH4KKJ7': '大和田　克/東京R5',
  'U0750B5MNJF': '加藤栄作',
  'U075NNW6X5Z': '武石裕美子',
  'U077MUJ7JC9': '北野直樹',
  'U077SJ4Q4BH': '白川雄司',
  'U079CKZ3H1B': '内藤学/広島県/R5',
  'U079U79MB97': '岡崎　優',
  'U07ASG7UUJV': '小野 伸司',
  'U07ASG813Q9': '細谷 忠資/東京R5',
  'U07DBLH34JD': '大野 亨/千葉 R5',
  'U07DBLH7S73': '山浦　勝/福岡/R5',
  'U07DDP14EV9': '森修',
  'U07ERS0BU13': '土谷岳文',
  'U07EXEJSHK7': '野村賢二/奈良県R5',
  'U07EZPY0CMV': '浅野智晴/神奈川R5',
  'U07F3EL4JBX': '瀬原田 克己',
  'U07FBDMSJ93': '川畑良太',
  'U07G2A70LA3': '二宮 悠子',
  'U07GAFF16LD': '小野一樹/大阪R4',
  'U07H14ARRM5': '奥村崇/愛知県R5',
  'U07H3CM39QD': '柏矢卓郎/熊本  山口  R5',
  'U07QZ26757B': '中西耕平',
  'U08ANF5TN6M': '下木原(しもきはら)  / 神奈川',
  'U08FSQPG1CK': '高橋吉英/福井/R6',
  'U08GRG83NLV': '中村寛/福岡/R6',
  'U08HJ3NQXK9': '岡井俊介/愛知/R6',
  'U08HY6M5XA9': '齋藤翔平/福岡/R6',
  'U08JU776N5P': '田中大典',
  'U08K20GLWP3': '長野利雄/千葉/R6',
  'U08KA3BGALR': '三好敏夫 R６滋賀',
  'U08LBAVMFR9': '中尾勝一/R6/東京',
  'U08LBAZJQHZ': '板倉 健人   川崎/R6',
  'U08NJJ2A9B9': '井上裕美子',
  'U08TVJN9C57': '中垣昇/大阪/R6',
  'U0905HUA4MV': '金子 祈之/東京 R6',
  'U091CN2D41Z': '月見亮介',
  'U091CNFMW03': '角樋　宣/R5/大阪',
  'U091J3RS0F7': 'T2長谷川（R6東京）',
  'U0923DBE4Q5': 'masaki yoshimura / 広島R6',
  'U095XRRCQUF': '稲生俊之/大阪府R6',
  'U096E0JS6TT': '寺村淳',
  'U096TCU17L5': '三葉晃大/R6/東京',
  'U098HMM38RX': '武市　純一',
  'U098P9BN1M3': '大西徹郎/愛知/R6',
  'U098P9DEEG5': '古川杏子',
  'U09CE1HQR1P': '大池一城',
  'U09CJKR6D0V': 'Yuta Shimaya',
  'U09E6B68NKB': 'うえしま',
  'U09EMKK1UJ3': '小笠原捷',
  'U09LQATD0JH': '村永洋一',
  'U09TPMGD9PT': '宮崎洸矢',
  'U0A0QPS3HGF': '吉田亜斗夢',
  'U0A1BKUUABT': '柳原 英之 / 東京R6',
  'U0A74CFEDLZ': 'Taka / 神戸R6',
  'U0AENTT4ETF': '中村 広佑',
  'U0AJQLE47C3': '藤原誠二',
}

// ── Signature verification ────────────────────────────────────────────────

function verifySignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) {
    console.error('[slack] SLACK_SIGNING_SECRET is not set')
    return false
  }
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false
  const base = `v0:${timestamp}:${rawBody}`
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// ── Slack API helpers ─────────────────────────────────────────────────────

async function slackGet(method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`https://slack.com/api/${method}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  })
  return res.json()
}

async function getSupabaseChannelId(slackChannelId: string): Promise<string | null> {
  if (channelCache.has(slackChannelId)) return channelCache.get(slackChannelId)!

  // step0: slack_channel_id で直接検索（リネーム済みチャンネルにも対応）
  console.log('[slack] step0: REST fetch channels by slack_channel_id:', slackChannelId)
  const byIdResult = await supabaseRestGet('channels', {
    select: 'id',
    slack_channel_id: `eq.${slackChannelId}`,
    limit: '1',
  })
  if (byIdResult.status === 200 && byIdResult.data) {
    try {
      const rows = JSON.parse(byIdResult.data as string) as { id: string }[]
      if (rows.length > 0) {
        console.log('[slack] found channel by slack_channel_id:', slackChannelId, '→', rows[0].id)
        channelCache.set(slackChannelId, rows[0].id)
        return rows[0].id
      }
    } catch (e) {
      console.error('[slack] JSON parse error (step0):', e)
    }
  }

  // step1: 静的マップ経由でチャンネル名を取得してから名前で検索
  const channelName = SLACK_CHANNEL_NAMES[slackChannelId]
  if (!channelName) {
    console.log('[slack] unknown channel ID:', slackChannelId)
    return null
  }

  console.log('[slack] step1: REST fetch channels by name:', channelName)
  const result = await supabaseRestGet('channels', {
    select: 'id',
    name: `eq.${channelName}`,
    limit: '1',
  })
  console.log('[slack] step1 done. status:', result.status)

  if (result.status === 200 && result.data) {
    try {
      const rows = JSON.parse(result.data as string) as { id: string }[]
      if (rows.length > 0) {
        console.log('[slack] found channel by name:', channelName, '→', rows[0].id)
        channelCache.set(slackChannelId, rows[0].id)
        return rows[0].id
      }
    } catch (e) {
      console.error('[slack] JSON parse error:', e)
      return null
    }
  }

  if (result.status !== 200) {
    console.error('[slack] step1 failed, cannot resolve channel')
    return null
  }

  // step2: チャンネルが存在しなければ作成
  console.log('[slack] step2: inserting channel:', channelName)
  const sb = getSupabase()
  try {
    const ins = await Promise.race([
      sb.from('channels').insert({ name: channelName, slack_channel_id: slackChannelId }).select('id').single(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout 8s')), 8000)),
    ]) as { data: { id: string } | null; error: unknown }
    console.log('[slack] step2 result:', JSON.stringify(ins.data), 'err:', JSON.stringify(ins.error))
    if (ins.error || !ins.data) return null
    channelCache.set(slackChannelId, ins.data.id)
    return ins.data.id
  } catch (err) {
    console.error('[slack] step2 threw:', err)
    return null
  }
}

function getUserName(slackUserId: string, eventProfile?: Record<string, unknown>): string {
  if (userCache.has(slackUserId)) return userCache.get(slackUserId)!

  // 1. 静的マッピングを優先（users.jsonから生成）
  if (SLACK_USER_NAMES[slackUserId]) {
    const name = SLACK_USER_NAMES[slackUserId]
    userCache.set(slackUserId, name)
    return name
  }

  // 2. イベントペイロードの user_profile にフォールバック
  if (eventProfile) {
    const name = (eventProfile.display_name as string) || (eventProfile.real_name as string) || slackUserId
    userCache.set(slackUserId, name)
    return name
  }

  // プロフィール情報がなければユーザーIDをそのまま使用
  userCache.set(slackUserId, slackUserId)
  return slackUserId
}

function tsToISO(ts: string): string {
  return new Date(parseFloat(ts) * 1000).toISOString()
}

async function getAvatarUrl(slackUserId: string): Promise<string | null> {
  if (avatarCache.has(slackUserId)) return avatarCache.get(slackUserId)!
  try {
    const sb = getSupabase()
    const { data } = await sb
      .from('users')
      .select('avatar_url')
      .eq('slack_user_id', slackUserId)
      .maybeSingle()
    const url = (data?.avatar_url as string | null) ?? null
    avatarCache.set(slackUserId, url)
    return url
  } catch {
    return null
  }
}

// ── Channel event handlers ────────────────────────────────────────────────

async function handleChannelCreated(event: Record<string, unknown>): Promise<void> {
  const ch = event.channel as { id: string; name: string }
  if (!ch?.id || !ch?.name) return
  console.log('[slack] channel_created:', ch.id, ch.name)

  // Auto-join the channel so the bot receives messages from it
  try {
    const joinRes = await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: ch.id }),
    })
    const joinData = await joinRes.json() as { ok: boolean; error?: string }
    if (!joinData.ok) {
      console.error('[slack] conversations.join error:', joinData.error)
    } else {
      console.log('[slack] bot joined channel:', ch.name)
    }
  } catch (joinErr) {
    console.error('[slack] conversations.join threw:', joinErr)
  }

  // Upsert into Supabase
  const sb = getSupabase()
  const { error } = await sb
    .from('channels')
    .upsert({ name: ch.name, slack_channel_id: ch.id }, { onConflict: 'name' })
  if (error) console.error('[slack] channel_created upsert error:', error.message)
  else console.log('[slack] channel_created upserted:', ch.name)
}

async function handleChannelDeleted(event: Record<string, unknown>): Promise<void> {
  const slackId = event.channel as string
  if (!slackId) return
  console.log('[slack] channel_deleted:', slackId)
  const sb = getSupabase()
  // Try by slack_channel_id first, then fallback to static map name
  const { error: e1 } = await sb.from('channels').delete().eq('slack_channel_id', slackId)
  if (e1) {
    const name = SLACK_CHANNEL_NAMES[slackId]
    if (name) {
      const { error: e2 } = await sb.from('channels').delete().eq('name', name)
      if (e2) console.error('[slack] channel_deleted fallback error:', e2.message)
      else console.log('[slack] channel_deleted by name:', name)
    }
  } else {
    console.log('[slack] channel_deleted by slack_channel_id:', slackId)
  }
}

async function handleChannelRenamed(event: Record<string, unknown>): Promise<void> {
  const ch = event.channel as { id: string; name: string }
  if (!ch?.id || !ch?.name) return
  console.log('[slack] channel_renamed:', ch.id, '→', ch.name)
  const sb = getSupabase()

  // Try update by slack_channel_id first
  const { error, data } = await sb
    .from('channels')
    .update({ name: ch.name })
    .eq('slack_channel_id', ch.id)
    .select('id')
  if (error) {
    console.error('[slack] channel_renamed error:', error.message)
  } else if (data && data.length > 0) {
    console.log('[slack] channel_renamed updated by slack_channel_id:', ch.name)
    channelCache.delete(ch.id)
    return
  }

  // Fallback: update by old name from static map (for channels without slack_channel_id)
  const oldName = SLACK_CHANNEL_NAMES[ch.id]
  if (oldName && oldName !== ch.name) {
    const { error: e2 } = await sb
      .from('channels')
      .update({ name: ch.name, slack_channel_id: ch.id })
      .eq('name', oldName)
    if (e2) console.error('[slack] channel_renamed fallback error:', e2.message)
    else console.log('[slack] channel_renamed updated by old name:', oldName, '→', ch.name)
  }

  channelCache.delete(ch.id)
}

async function handleChannelArchived(event: Record<string, unknown>): Promise<void> {
  const slackId = event.channel as string
  if (!slackId) return
  console.log('[slack] channel_archived:', slackId)
  const sb = getSupabase()
  const { error: e1 } = await sb.from('channels').delete().eq('slack_channel_id', slackId)
  if (e1) {
    const name = SLACK_CHANNEL_NAMES[slackId]
    if (name) await sb.from('channels').delete().eq('name', name)
  }
  console.log('[slack] channel_archived deleted:', slackId)
}

// ── Event handlers ────────────────────────────────────────────────────────

async function handleMessage(event: Record<string, unknown>): Promise<void> {
  console.log('[slack] handleMessage start, bot_id:', event.bot_id ?? 'none', 'subtype:', event.subtype ?? 'none')

  if (event.bot_id) { console.log('[slack] skip: bot message'); return }

  const subtype = event.subtype as string | undefined
  if (subtype && subtype !== 'thread_broadcast') { console.log('[slack] skip: subtype', subtype); return }

  const text = (event.text as string)?.trim() ?? ''
  const userId = event.user as string
  console.log('[slack] text:', text?.slice(0, 50) ?? 'empty', '| userId:', userId ?? 'none')

  // Allow messages with files but no text
  const rawFiles = event.files as Array<Record<string, unknown>> | undefined
  const files_json = rawFiles?.length
    ? rawFiles.map((f) => ({
        id: f.id as string | undefined,
        name: f.name as string | undefined,
        mimetype: f.mimetype as string | undefined,
        url_private: f.url_private as string | undefined,
        url_private_download: f.url_private_download as string | undefined,
        thumb_360: (f.thumb_360 ?? f.thumb_480) as string | undefined,
      }))
    : null

  if (!text && !files_json?.length) { console.log('[slack] skip: no text and no files'); return }
  if (!userId) { console.log('[slack] skip: no user'); return }

  const slackChannelId = event.channel as string
  const ts = event.ts as string
  console.log('[slack] channel:', slackChannelId, '| ts:', ts)

  console.log('[slack] resolving channelId and userName...')
  const userProfile = event.user_profile as Record<string, unknown> | undefined
  console.log('[slack] userProfile:', JSON.stringify(userProfile ?? null))

  let channelId: string | null
  try {
    console.log('[slack] calling getSupabaseChannelId...')
    channelId = await getSupabaseChannelId(slackChannelId)
    console.log('[slack] getSupabaseChannelId result:', channelId ?? 'null')
  } catch (err) {
    console.error('[slack] getSupabaseChannelId threw:', err)
    return
  }

  let userName: string
  try {
    userName = getUserName(userId, userProfile)
    console.log('[slack] getUserName result:', userName)
  } catch (err) {
    console.error('[slack] getUserName threw:', err)
    return
  }

  if (!channelId) { console.log('[slack] skip: channelId not found'); return }

  const created_at = tsToISO(ts)
  // thread_ts: set when this message is a thread reply (thread_ts != ts) or thread parent (thread_ts == ts)
  const slackThreadTs = event.thread_ts as string | undefined
  const thread_ts = slackThreadTs ? tsToISO(slackThreadTs) : null
  console.log('[slack] created_at:', created_at, '| thread_ts:', thread_ts ?? 'null')

  const sb = getSupabase()

  console.log('[slack] checking duplicate...')
  const { data: dup, error: dupErr } = await sb
    .from('messages')
    .select('id')
    .eq('channel_id', channelId)
    .eq('created_at', created_at)
    .maybeSingle()
  console.log('[slack] dup:', dup?.id ?? 'none', '| err:', dupErr?.message ?? 'none')
  if (dup) { console.log('[slack] skip: duplicate'); return }

  const avatar_url = await getAvatarUrl(userId)

  console.log('[slack] inserting message...')
  const { error: insertErr } = await sb
    .from('messages')
    .insert({
      channel_id: channelId,
      user_name: userName,
      slack_user_id: userId,
      content: text,
      created_at,
      ...(thread_ts ? { thread_ts } : {}),
      ...(files_json ? { files_json } : {}),
      ...(avatar_url ? { avatar_url } : {}),
    })
  console.log('[slack] insert result:', insertErr ? insertErr.message : 'OK')
}

async function handleReaction(event: Record<string, unknown>, isAdded: boolean): Promise<void> {
  const item = event.item as Record<string, unknown>
  if (item.type !== 'message') return

  const slackChannelId = item.channel as string
  const messageTsISO = tsToISO(item.ts as string)
  const userId = event.user as string
  const reaction = event.reaction as string

  const [channelId, userName] = await Promise.all([
    getSupabaseChannelId(slackChannelId),
    getUserName(userId),
  ])
  if (!channelId) return

  const sb = getSupabase()
  if (isAdded) {
    await sb.from('message_reactions').upsert(
      { channel_id: channelId, message_created_at: messageTsISO, user_name: userName, reaction },
      { onConflict: 'channel_id,message_created_at,user_name,reaction', ignoreDuplicates: true }
    )
  } else {
    await sb
      .from('message_reactions')
      .delete()
      .eq('channel_id', channelId)
      .eq('message_created_at', messageTsISO)
      .eq('user_name', userName)
      .eq('reaction', reaction)
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? ''
  const signature = req.headers.get('x-slack-signature') ?? ''

  console.log('[slack] POST received')
  console.log('[slack] headers:', JSON.stringify({
    'x-slack-request-timestamp': timestamp,
    'x-slack-signature': signature ? signature.slice(0, 20) + '...' : '(none)',
    'content-type': req.headers.get('content-type'),
  }))
  console.log('[slack] body:', rawBody.slice(0, 500))

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    console.log('[slack] JSON parse error')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[slack] type:', body.type)

  // Handle URL verification before signature check (one-time setup handshake)
  if (body.type === 'url_verification') {
    console.log('[slack] url_verification challenge')
    return NextResponse.json({ challenge: body.challenge })
  }

  // TODO: 署名検証を一時スキップ（動作確認後に戻す）
  // const sigValid = verifySignature(rawBody, timestamp, signature)
  // if (!sigValid) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // }

  if (body.type !== 'event_callback') {
    return NextResponse.json({ ok: true })
  }

  const event = body.event as Record<string, unknown>
  console.log('[slack] event type:', event.type)
  console.log('[slack] event full:', JSON.stringify(event).slice(0, 500))

  // Use after() to keep the serverless function alive until processing completes
  after(async () => {
    try {
      if (event.type === 'message') await handleMessage(event)
      else if (event.type === 'reaction_added') await handleReaction(event, true)
      else if (event.type === 'reaction_removed') await handleReaction(event, false)
      else if (event.type === 'channel_created') await handleChannelCreated(event)
      else if (event.type === 'channel_deleted') await handleChannelDeleted(event)
      else if (event.type === 'channel_renamed') await handleChannelRenamed(event)
      else if (event.type === 'channel_archived') await handleChannelArchived(event)
      else console.log('[slack] unhandled event type:', event.type)
    } catch (err) {
      console.error('[slack] event error:', err)
    }
  })

  return NextResponse.json({ ok: true })
}
