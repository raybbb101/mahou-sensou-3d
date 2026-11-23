// 魔法戦争 3D — ゲームデータ(描画に依存しない純データ)。
export const ARENA_R = 150;
export const MAX_SLOTS = 4;
export const MAX_RANK = 5;
export const FLOORS = 10;

export const ELEMENTS = {
  fire:    { name: "火", color: "#ff7a2a" },
  ice:     { name: "氷", color: "#7cd4ff" },
  thunder: { name: "雷", color: "#ffe14a" },
  holy:    { name: "聖", color: "#fff09a" },
  shadow:  { name: "闇", color: "#b07cff" },
  wind:    { name: "風", color: "#8af0b4" },
};

// tier 1 = 基本(シンプル) / tier 2 = 上級(ちょっと派手)
const S = (id, name, elem, tier, cd, dmg, kind, extra) => ({ id, name, elem, tier, cd, dmg, kind, ...extra });
const LIST = [
  // ── 基本 ──
  S("fireball", "ファイアボール", "fire", 1, 1.1, 30, "bolt", { speed: 210, r: 6, splash: 24, desc: "火球を撃つ。着弾で小さく爆ぜる。" }),
  S("ice-shard", "アイスシャード", "ice", 1, 1.4, 13, "bolt", { speed: 260, r: 5, n: 3, spread: .22, slow: 1.5, desc: "氷の破片を3つ扇状に撃つ。当たると鈍らせる。" }),
  S("spark", "スパーク", "thunder", 1, 1.6, 22, "chain", { range: 150, chains: 2, desc: "近くの敵に雷を落とし、さらに2体へ跳ねる。" }),
  S("holy-arrow", "ホーリーアロー", "holy", 1, 1.0, 20, "bolt", { speed: 330, r: 5, pierce: 1, desc: "光の矢。敵を貫く。" }),
  S("shadow-orb", "シャドウオーブ", "shadow", 1, 2.0, 40, "bolt", { speed: 110, r: 7, homing: 3, desc: "ゆっくり敵を追いかける闇の球。" }),
  S("wind-cutter", "ウィンドカッター", "wind", 1, 1.8, 18, "boomerang", { speed: 230, r: 7, range: 150, desc: "風の刃を投げる。戻ってくる時にも当たる。" }),
  S("frost-nova", "フロストノヴァ", "ice", 1, 5, 30, "nova", { r: 72, slow: 2.5, desc: "足元から冷気を広げ、周りの敵を鈍らせる。" }),
  S("heal-light", "ヒールライト", "holy", 1, 12, 0, "heal", { r: 95, heal: .3, desc: "自分と近くの仲間のHPを30%回復する。" }),
  S("blink", "ブリンク", "wind", 1, 4, 0, "blink", { dist: 85, desc: "移動方向へ瞬間移動する。移動中は無敵。" }),
  // ── 上級 ──
  S("meteor", "メテオ", "fire", 2, 7, 115, "ground", { r: 52, delay: .9, range: 260, desc: "空から燃える岩を落とす。少し遅れて着弾する。" }),
  S("flame-ring", "フレイムリング", "fire", 2, 6, 55, "ring", { r: 105, dur: .55, desc: "自分を中心に炎の輪を広げる。" }),
  S("ice-spikes", "アイススパイク", "ice", 2, 6, 75, "line", { len: 180, wid: 24, delay: .3, slow: 2, desc: "氷の柱を一直線に突き上げる。" }),
  S("thunderstorm", "サンダーストーム", "thunder", 2, 8, 38, "storm", { n: 5, r: 26, gap: .3, desc: "雷を5回、敵へ次々と落とす。" }),
  S("holy-pillar", "ホーリーピラー", "holy", 2, 8, 95, "ground", { r: 40, delay: .55, range: 260, healIn: .15, desc: "光の柱を降ろす。中にいる仲間は回復する。" }),
  S("black-hole", "ブラックホール", "shadow", 2, 9, 9, "zone", { r: 64, dur: 3, tick: .25, pull: 70, range: 240, desc: "敵を吸い込み続ける闇の渦を作る。" }),
  S("tornado", "トルネード", "wind", 2, 8, 11, "zone", { r: 32, dur: 4, tick: .3, move: 55, range: 260, desc: "敵へ向かって進む竜巻を呼ぶ。" }),
];
export const SPELLS = Object.fromEntries(LIST.map((s) => [s.id, s]));
export const SPELL_IDS = LIST.map((s) => s.id);
export const spellDmg = (s, rank) => s.dmg * (1 + .25 * (rank - 1));
export const spellCd = (s, rank) => s.cd * (1 - .05 * (rank - 1));
export const isAttack = (id) => SPELLS[id].dmg > 0;

// 究極魔法(超派手・カットシーン付き)。第1層で1つ選ぶ。与ダメージでチャージ。
const U = (id, name, elem, desc, extra = {}) => ({ id, name, elem, desc, ...extra });
const ULIST = [
  U("sky-meteor", "天墜・紅蓮メテオ", "fire", "天から巨大な隕石を落とし、闘技場ごと焼き払う。"),
  U("absolute-zero", "絶対零度", "ice", "あらゆる敵を5秒間凍らせ、氷ごと砕く。凍った敵は受けるダメージ+30%。"),
  U("thunder-god", "神鳴・百雷", "thunder", "雷雲を呼び、敵へ12本の天雷を叩きつける。"),
  U("judgment", "聖天の審判", "holy", "天の光柱で敵を裁く。味方を全回復し、倒れた仲間も起こす。"),
  U("void-maw", "虚無の顎", "shadow", "空間ごと敵を呑み込む。敵の弾と小物をすべて消し去る。"),
  U("wind-god", "風神降臨", "wind", "巨大な竜巻をまとい8秒間暴れる。味方全員が加速し、魔法の再使用が2倍速。"),
];
export const ULTS = Object.fromEntries(ULIST.map((u) => [u.id, u]));
export const ULT_IDS = ULIST.map((u) => u.id);
export const CUT_DUR = 3.6, CUT_HIT = 2.45;

// ボス戦の報酬
export const REWARDS = {
  hp:   { name: "最大HP +25", desc: "倒れにくくなる。" },
  atk:  { name: "攻撃力 +15%", desc: "すべての魔法のダメージが上がる。" },
  cdr:  { name: "詠唱速度 +10%", desc: "魔法の再使用が速くなる。" },
  spd:  { name: "移動速度 +10%", desc: "弾をよけやすくなる。" },
  ultc: { name: "究極チャージ +25%", desc: "究極魔法が早く溜まる。" },
  rank: { name: "魔法ランク +1", desc: "持っている魔法を1つランクアップする(ランダム)。" },
};
export const REWARD_IDS = Object.keys(REWARDS);

// ボス。atk は [パターン, パラメータ]。p2 は HP 半分以下で加わる技。
// 名前は「魔法戦争 v1」のボスから。
export const BOSSES = [
  { id: "golem", name: "苔石の門番 グロムス", elem: "wind", theme: "moss", hp: 800, speed: 22, r: 20, weak: ["fire"], resist: ["wind"], every: 2.4,
    atk: [["slam", { r: 70, delay: .9, dmg: 20 }], ["rain", { n: 3, r: 26, delay: 1.1, dmg: 18 }], ["ring", { n: 12, speed: 65, dmg: 10 }]],
    p2: [["lines", { n: 4, len: 220, wid: 22, delay: .9, dmg: 20 }]] },
  { id: "slime", name: "泡沫王 スラムール", elem: "ice", theme: "flood", hp: 1100, speed: 30, r: 20, weak: ["thunder"], resist: ["ice"], every: 2.3,
    atk: [["leap", { r: 44, delay: 1, dmg: 22 }], ["summon", { kind: "slime", n: 3 }], ["ring", { n: 10, speed: 70, dmg: 10 }]],
    p2: [["spiral", { dur: 2.2, rate: 12, arms: 2, speed: 70, dmg: 9 }]] },
  { id: "salamander", name: "炎尾 サラマンドラ", elem: "fire", theme: "ember", hp: 1500, speed: 44, r: 18, weak: ["ice"], resist: ["fire"], every: 2.1,
    atk: [["cone", { len: 130, ang: .75, delay: .7, dmg: 24 }], ["aimed", { n: 5, spread: .5, speed: 120, dmg: 11 }], ["dash", { delay: .7, speed: 260, dmg: 22 }]],
    p2: [["rain", { n: 5, r: 30, delay: 1, dmg: 20 }]] },
  { id: "iceknight", name: "氷棺の騎士 ニヴェリス", elem: "ice", theme: "ice", hp: 1900, speed: 46, r: 18, weak: ["fire"], resist: ["ice"], every: 2.0,
    atk: [["dash", { delay: .6, speed: 300, dmg: 24 }], ["lines", { n: 8, len: 200, wid: 18, delay: .9, dmg: 22 }], ["aimed", { n: 3, spread: .25, speed: 170, dmg: 13 }]],
    p2: [["ring", { n: 16, speed: 80, dmg: 12 }], ["slam", { r: 80, delay: .8, dmg: 24 }]] },
  { id: "raven", name: "雷雲鴉 ヴォルトレイヴン", elem: "thunder", theme: "storm", hp: 2400, speed: 80, r: 16, fly: 18, weak: ["ice"], resist: ["thunder"], every: 1.8,
    atk: [["rain", { n: 6, r: 24, delay: .9, dmg: 20 }], ["aimed", { n: 4, spread: .35, speed: 160, dmg: 12 }], ["dash", { delay: .5, speed: 320, dmg: 20 }]],
    p2: [["spiral", { dur: 2.4, rate: 16, arms: 3, speed: 80, dmg: 10 }]] },
  { id: "necro", name: "骸の司祭 モルドレイ", elem: "shadow", theme: "crypt", hp: 3000, speed: 28, r: 18, weak: ["holy"], resist: ["shadow"], every: 2.0,
    atk: [["summon", { kind: "skull", n: 3 }], ["ring", { n: 14, speed: 55, dmg: 12 }], ["rain", { n: 4, r: 30, delay: 1, dmg: 22 }]],
    p2: [["spiral", { dur: 3, rate: 14, arms: 4, speed: 60, dmg: 11 }]] },
  { id: "mech", name: "機神 プラズマ=オルゴン", elem: "thunder", theme: "machine", hp: 3700, speed: 40, r: 22, weak: ["thunder"], resist: ["fire"], every: 1.9,
    atk: [["lines", { n: 4, len: 240, wid: 20, delay: .8, dmg: 24, rot: 1 }], ["spiral", { dur: 2.2, rate: 16, arms: 2, speed: 90, dmg: 11 }], ["summon", { kind: "bat", n: 4 }]],
    p2: [["rain", { n: 6, r: 28, delay: .9, dmg: 22 }], ["ring", { n: 20, speed: 85, dmg: 12 }]] },
  { id: "angel", name: "堕天使 ルシエラ", elem: "holy", theme: "cathedral", hp: 4500, speed: 60, r: 17, fly: 14, weak: ["shadow"], resist: ["holy"], every: 1.8,
    atk: [["aimed", { n: 7, spread: .7, speed: 150, dmg: 13 }], ["rain", { n: 5, r: 34, delay: 1, dmg: 24 }], ["ring", { n: 18, speed: 75, dmg: 12 }]],
    p2: [["lines", { n: 8, len: 230, wid: 18, delay: .8, dmg: 24 }], ["spiral", { dur: 2.6, rate: 18, arms: 3, speed: 85, dmg: 11 }]] },
  { id: "drake", name: "溶岩巨竜 イグニドレイク", elem: "fire", theme: "lava", hp: 5400, speed: 36, r: 26, weak: ["ice"], resist: ["fire"], every: 1.9,
    atk: [["cone", { len: 150, ang: .9, delay: .7, dmg: 28 }], ["rain", { n: 8, r: 30, delay: 1.1, dmg: 24 }], ["slam", { r: 90, delay: .9, dmg: 26 }], ["dash", { delay: .7, speed: 260, dmg: 28 }]],
    p2: [["ring", { n: 22, speed: 80, dmg: 13 }]] },
  { id: "warlord", name: "魔法戦争の王 ノクス=アルカ", elem: "shadow", theme: "apex", hp: 7500, speed: 56, r: 18, weak: [], resist: [], every: 1.6,
    atk: [["aimed", { n: 5, spread: .45, speed: 170, dmg: 14 }], ["rain", { n: 6, r: 30, delay: .9, dmg: 24 }], ["lines", { n: 6, len: 240, wid: 20, delay: .8, dmg: 24, rot: 1 }], ["summon", { kind: "skull", n: 2 }], ["dash", { delay: .55, speed: 330, dmg: 26 }]],
    p2: [["spiral", { dur: 3, rate: 20, arms: 4, speed: 85, dmg: 12 }], ["ring", { n: 24, speed: 90, dmg: 13 }]] },
];

export const MINIONS = {
  slime: { hp: 60, speed: 40, r: 7, dmg: 10 },
  skull: { hp: 70, speed: 30, r: 7, dmg: 10, shoot: 2.4 },
  bat:   { hp: 45, speed: 70, r: 6, dmg: 8, fly: 10 },
};

export const THEMES = {
  moss:      { name: "苔むす石庭", bg: ["#0b1410", "#1a2a1c"], floor: ["#1c2420", "#2c3a2e", "#3e5040", "#5c7258"], accent: "#7cc048", rune: "#9cf070" },
  flood:     { name: "沈んだ回廊", bg: ["#081420", "#12304a"], floor: ["#14202c", "#20344a", "#2e4c68", "#4c7494"], accent: "#3a9df0", rune: "#7ad0ff" },
  ember:     { name: "燠火の祭壇", bg: ["#180a08", "#341410"], floor: ["#241614", "#3a201a", "#563022", "#7a4a2c"], accent: "#ff7a2a", rune: "#ffb060" },
  ice:       { name: "氷棺の間", bg: ["#0a1420", "#1c3046"], floor: ["#1e2c3c", "#30485e", "#4c6c86", "#86aec8"], accent: "#a8e0ff", rune: "#d6f4ff" },
  storm:     { name: "雷雲の頂", bg: ["#0a0c1c", "#1c2040"], floor: ["#1a1c2a", "#2a2e40", "#3e4458", "#5e6680"], accent: "#ffe14a", rune: "#fff27a" },
  crypt:     { name: "骸の地下墓所", bg: ["#0c0812", "#1c1226"], floor: ["#1a1420", "#28202e", "#3a2e40", "#54465a"], accent: "#a070e0", rune: "#c69bff" },
  machine:   { name: "機神の炉", bg: ["#081014", "#142028"], floor: ["#161c22", "#242c34", "#36404a", "#525e6a"], accent: "#3cf0ff", rune: "#7ff6ff" },
  cathedral: { name: "堕ちた大聖堂", bg: ["#141018", "#2a2232"], floor: ["#262028", "#3a3238", "#544a4e", "#7c7068"], accent: "#fff09a", rune: "#fff6c4" },
  lava:      { name: "溶岩の玉座", bg: ["#140604", "#2c0c06"], floor: ["#201010", "#341a14", "#4a261a", "#6a3a24"], accent: "#ff5a20", rune: "#ff9a3c" },
  apex:      { name: "魔法戦争の頂", bg: ["#08060e", "#1a1030"], floor: ["#1a1626", "#2a2438", "#3e3650", "#5c5274"], accent: "#ec6cff", rune: "#ffb0ff" },
};

export const PLAYER_COLORS = ["#d8486a", "#3f8cff", "#45b86a", "#e8a218"];
export const BASE = { hp: 100, spd: 74 };

// ───────── 迷宮モード ─────────
export const TILE = 16;
export const STAGES = 10;
export const RARITY = [
  { name: "コモン", color: "#c9c2b2", mult: 1.0 },
  { name: "アンコモン", color: "#7fd16f", mult: 1.16 },
  { name: "レア", color: "#5fa8ff", mult: 1.34 },
  { name: "エピック", color: "#c983ff", mult: 1.58 },
  { name: "レジェンド", color: "#ffb340", mult: 1.9 },
];
export const AFFIX = {
  burn: { pre: "炎の", desc: "ダメージ +20%" },
  frost: { pre: "氷の", desc: "当てた敵を鈍らせる" },
  vamp: { pre: "吸血の", desc: "与えたダメージの5%を回復" },
  swift: { pre: "疾風の", desc: "攻撃速度 +18%" },
  crit: { pre: "必殺の", desc: "会心率 +15%" },
};
export const AFFIX_IDS = Object.keys(AFFIX);
// kind: melee(近接の扇) / bolt(弾) / summon(召喚)
export const DWEAPONS = {
  sword: { name: "長剣", kind: "melee", dmg: 16, rate: .42, range: 30, arc: 2.0 },
  axe:   { name: "戦鎚", kind: "melee", dmg: 29, rate: .78, range: 32, arc: 2.6 },
  spear: { name: "槍",   kind: "melee", dmg: 18, rate: .5,  range: 44, arc: .8 },
  bow:   { name: "長弓", kind: "bolt", dmg: 14, rate: .45, proj: "arrow", speed: 360 },
  xbow:  { name: "連弩", kind: "bolt", dmg: 8,  rate: .24, proj: "arrow", speed: 400 },
  staff: { name: "魔杖", kind: "bolt", dmg: 17, rate: .55, proj: "magic-bolt", speed: 260 },
  tome:  { name: "魔導書", kind: "bolt", dmg: 11, rate: .34, proj: "magic-bolt", speed: 240, homing: 2 },
  orb:   { name: "召喚石", kind: "summon", dmg: 1, rate: 1.1 },
};
// 4 人のキャラクター。skills = [通常攻撃, 基本の魔法, 上級の魔法]、ult = 究極魔法(カットシーン)
export const CHARS = {
  knight:   { name: "剣士", desc: "前に出て斬る。打たれ強い。", hp: 135, spd: 72, weapons: ["sword", "axe", "spear"], skills: ["slash", "whirl", "quake"], ult: "thunder-god" },
  archer:   { name: "弓使い", desc: "離れて射る。足が速い。", hp: 95, spd: 84, weapons: ["bow", "xbow"], skills: ["arrow", "multishot", "arrow-rain"], ult: "wind-god" },
  mage:     { name: "魔導士", desc: "強い魔法で焼き払う。体は脆い。", hp: 85, spd: 74, weapons: ["staff", "tome"], skills: ["magic-bolt", "fireball", "meteor"], ult: "sky-meteor" },
  summoner: { name: "召喚師", desc: "使い魔・精霊・ゴーレムを呼んで戦う。自分では攻撃しない。", hp: 95, spd: 74, weapons: ["orb"], skills: ["sum-bat", "sum-wisp", "sum-golem"], ult: "void-maw" },
};
export const CHAR_IDS = Object.keys(CHARS);
const D = (id, name, elem, tier, cd, dmg, kind, extra) => { SPELLS[id] = { id, name, elem, tier, cd, dmg, kind, dungeon: 1, ...extra }; };
D("slash", "斬撃", "wind", 0, .42, 16, "melee", { desc: "武器で前方を斬る。" });
D("arrow", "射撃", "wind", 0, .45, 14, "wbolt", { desc: "矢を放つ。" });
D("magic-bolt", "魔弾", "holy", 0, .55, 17, "wbolt", { desc: "魔力の弾を撃つ。" });
D("sum-bat", "使い魔", "shadow", 0, 1.1, 8, "summon", { su: "bat", desc: "敵に噛みつくコウモリを呼ぶ(3体まで)。" });
D("whirl", "旋風斬", "wind", 1, 5, 34, "nova", { r: 52, desc: "周りをまとめて薙ぎ払う。" });
D("quake", "地裂斬", "fire", 2, 7, 80, "line", { len: 150, wid: 24, delay: .25, desc: "地面ごと一直線に斬り裂き、炎が走る。" });
D("multishot", "拡散射", "wind", 1, 4, 14, "bolt", { speed: 340, r: 4, n: 5, spread: .2, desc: "5本の矢を扇状に放つ。" });
D("arrow-rain", "矢の雨", "wind", 2, 8, 30, "storm", { n: 10, r: 24, gap: .1, desc: "敵の頭上に矢を降らせる。" });
D("sum-wisp", "精霊召喚", "holy", 1, 9, 12, "summon", { su: "wisp", n: 2, desc: "まわりを飛んで魔弾を撃つ精霊を2体呼ぶ。" });
D("sum-golem", "ゴーレム召喚", "fire", 2, 14, 42, "summon", { su: "golem", desc: "敵へ歩いて地面を叩くゴーレムを呼ぶ。" });
export const SUMMON = {
  bat:   { life: 10, speed: 95, cap: 3, atk: .5 },
  wisp:  { life: 12, cap: 4, atk: .8 },
  golem: { life: 15, speed: 46, cap: 1, atk: 1.4, r: 34 },
};
