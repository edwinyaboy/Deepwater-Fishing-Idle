
import {
  fishRarities, locations, fishCatalogue, relicShards, junkCatalogue,
  getLocationById, getFishPoolForLocation, getFishById,
  LEGACY_NAME_TO_ID, SHINY_SELL_MULTIPLIER
} from './fishes.js';
import { getXpToNextLevel } from './xpLogic.js';
import { skillTreeNodes, getNodeById, getNodeStatus, canAffordNode } from './skillTree.js';

const LEGACY_SAVE_KEY = 'zeldaFishingV2';
const SAVE_KEY = 'deepwaterFishingV1';
const SAVE_BACKUP_KEY = SAVE_KEY + ':backup';
const SAVE_VERSION = 8;
const RARITY_ORDER = fishRarities.map(r => r.name);

export let gameState = {
  saveVersion: SAVE_VERSION,
  coins: 0,
  pearls: 0,
  xp: 0,
  level: 1,
  lifetimeFish: 0,
  timesFished: 0,
  inventory: {},
  fishIndex: {},
  autoFishUnlocked: false,
  tripleHookUnlocked: false,
  reelSpeedLevel: 0,
  luckLevel: 0,
  renownLevel: 0,
  idleEfficiencyLevel: 0,
  collectedShards: {},
  achievements: {},
  junkCaught: 0,
  junkIndex: {},
  revealSpeedLevel: 0,
  castStreak: 0,
  lastManualCastAt: 0,
  totalSpent: 0,
  pearlsSpent: 0,
  activePotions: { luck: 0, reel: 0 },
  temporaryBoosts: { luck: 0, reelSpeed: 0 },
  chumBoost: null,
  currentLocation: 'shallows',
  unlockedLocations: ['shallows'],
  autoSellRarity: 'none',
  autoSellMaxWeight: null,
  lastSeen: Date.now(),
  offlineCatchesLifetime: 0,
  lifetimeCoinsEarned: 0,
  heaviestCatch: 0,
  musicVolume: 0.35,
  uiVolume: 0.5,
  skillTreeUnlocked: {},
  skillTreeCycleLevels: {},
  rebirthCount: 0,
  rebirthPoints: 0,
  tutorialCompleted: false,
  tutorialStep: null
};

const PRISTINE_GAME_STATE = JSON.parse(JSON.stringify(gameState));

const BAIT_TIERS = [
  { level: 0,  name: 'Old Hook',      tier: 0, icon: 'starter' },
  { level: 5,  name: 'Polished Hook', tier: 1, icon: 'coral' },
  { level: 10, name: 'Copper Hook',   tier: 2, icon: 'frog' },
  { level: 20, name: 'Golden Hook',   tier: 3, icon: 'sink' }
];

const ROD_CAST_MS = [3000, 2200, 1500, 900];

const AUTO_FISH_UNLOCK_LEVEL = 4;

const TRIPLE_HOOK_CONFIG = { unlockLevel: 15, cost: 500000 };

function getRollCount() {
  return gameState.tripleHookUnlocked ? 3 : 1;
}

const CHUM_TIERS = [
  { id: 'chum1', name: 'Simple Chum',    cost: 1500,  luckBonus: 0.10, uses: 20 },
  { id: 'chum2', name: 'Rich Chum',      cost: 8000,  luckBonus: 0.20, uses: 20 },
  { id: 'chum3', name: 'Enchanted Chum', cost: 30000, luckBonus: 0.35, uses: 20 }
];

const RENOWN_BASE_COST = 100000;
const RENOWN_COST_GROWTH = 1.6;
const RENOWN_BONUS_PER_LEVEL = 0.05;

function getRenownCost(level) {
  return Math.floor(RENOWN_BASE_COST * Math.pow(RENOWN_COST_GROWTH, level));
}

const IDLE_EFFICIENCY_BASE_COST = 20000;
const IDLE_EFFICIENCY_COST_GROWTH = 1.35;
const IDLE_EFFICIENCY_INTERVAL_MULT = 0.92;
const IDLE_EFFICIENCY_EXTRA_CATCHES = 20;

function getIdleEfficiencyCost(level) {
  return Math.floor(IDLE_EFFICIENCY_BASE_COST * Math.pow(IDLE_EFFICIENCY_COST_GROWTH, level));
}

const JUNK_CHANCE = 0.06;

function getRenownMultiplier() {
  return 1 + gameState.renownLevel * RENOWN_BONUS_PER_LEVEL;
}


function getAvailableRaritiesForTier(tier) {
  switch (tier) {
    case 0: return ['Common', 'Rare'];
    case 1: return ['Common', 'Rare', 'Epic', 'Heroic'];
    case 2: return ['Common', 'Rare', 'Epic', 'Heroic', 'Legendary', 'Mythical'];
    case 3: return ['Common', 'Rare', 'Epic', 'Heroic', 'Legendary', 'Mythical', 'Secret', 'Relic'];
    default: return ['Common', 'Rare'];
  }
}

function getCurrentBait() {
  let current = BAIT_TIERS[0];
  BAIT_TIERS.forEach(b => { if (gameState.level >= b.level) current = b; });
  return current;
}

const ACHIEVEMENTS = {
  catch: {
    firstCatch: { name: 'First Catch', desc: 'Catch your first fish', reward: 5, unlocked: false },
    collector: { name: 'Collector', desc: 'Catch 10 different species', reward: 20, unlocked: false },
    anglerMaster: { name: 'Angler Master', desc: 'Catch every species in the cove', reward: 100, rebirthPointReward: 3, unlocked: false },
    rareCatch: { name: 'Rare Catch', desc: 'Catch a Rare fish', reward: 10, unlocked: false },
    epicCatch: { name: 'Epic Catch', desc: 'Catch an Epic fish', reward: 15, unlocked: false },
    heroicCatch: { name: 'Heroic Catch', desc: 'Catch a Heroic fish', reward: 25, unlocked: false },
    legendaryCatch: { name: 'Legendary Catch', desc: 'Catch a Legendary fish', reward: 40, unlocked: false },
    mythicalCatch: { name: 'Mythical Catch', desc: 'Catch a Mythical fish', reward: 50, unlocked: false },
    secretCatch: { name: 'Secret Catch', desc: 'Catch a Secret fish', reward: 100, unlocked: false },
    bigCatch: { name: 'Trophy Catch', desc: 'Reel in a fish weighing 20 lbs or more', reward: 35, unlocked: false },
    monsterCatch: { name: 'Monster Catch', desc: 'Reel in a fish weighing 50 lbs or more', reward: 70, unlocked: false }
  },
  shiny: {
    shinyHunter: { name: 'Shiny Hunter', desc: 'Catch your first shiny', reward: 30, unlocked: false },
    shinyCollector: { name: 'Shiny Collector', desc: 'Catch 10 shinies', reward: 50, unlocked: false }
  },
  quantity: {
    busyBeaver: { name: 'Busy Beaver', desc: 'Catch 100 fish total', reward: 25, unlocked: false },
    fishingFrenzy: { name: 'Fishing Frenzy', desc: 'Catch 500 fish total', reward: 50, unlocked: false },
    lifetimeAngler: { name: 'Lifetime Angler', desc: 'Catch 1000 fish total', reward: 100, rebirthPointReward: 2, unlocked: false }
  },
  gear: {
    baitBeginner: { name: 'Bait Beginner', desc: 'Unlock the Polished Hook', reward: 10, unlocked: false },
    lurePro: { name: 'Lure Pro', desc: 'Unlock the Copper Hook', reward: 20, unlocked: false },
    lureMaster: { name: 'Lure Master', desc: 'Unlock the Golden Hook', reward: 30, unlocked: false }
  },
  skill: {
    reelSpeedDemon: { name: 'Master Angler', desc: 'Max out your Fishing Rod', reward: 40, unlocked: false },
    luckyAngler: { name: 'Lucky Angler', desc: 'Max out Luck', reward: 40, unlocked: false },
    renownedAngler: { name: 'Renowned Angler', desc: 'Reach Angler’s Renown level 5', reward: 60, unlocked: false }
  },
  upgrade: {
    autoFishOwner: { name: 'Auto-Fish Owner', desc: 'Buy Auto Fish', reward: 25, unlocked: false },
    bigSpender: { name: 'Big Spender', desc: 'Spend 50,000 coins', reward: 75, unlocked: false },
    treasureHunter: { name: 'Treasure Hunter', desc: 'Spend 1,000 Pearls opening chests', reward: 50, unlocked: false }
  },
  location: {
    explorer: { name: 'Explorer', desc: 'Unlock every fishing location', reward: 80, rebirthPointReward: 2, unlocked: false }
  },
  relic: {
    tideheartComplete: { name: 'The Tideheart Restored', desc: 'Recover all 8 Tideheart relics', reward: 200, rebirthPointReward: 3, unlocked: false }
  },
  idle: {
    welcomeBack: { name: 'Welcome Back', desc: 'Return after being away for an hour or more', reward: 10, unlocked: false }
  },
  junk: {
    beachcomber: { name: 'Beachcomber', desc: 'Reel in 10 pieces of junk', reward: 15, unlocked: false },
    fullCollection: { name: 'One Angler\'s Trash', desc: 'Find every kind of junk at least once', reward: 30, unlocked: false }
  }
};

const elements = {
  coins: document.getElementById('coin-count'),
  pearls: document.getElementById('gem-count'),
  lifetimeFish: document.getElementById('lifetime-fish-count'),
  luck: document.getElementById('luck-percentage'),
  reelSpeed: document.getElementById('reel-speed-level'),
  xpLevel: document.getElementById('xp-level'),
  xpProgress: document.getElementById('xp-progress'),
  xpText: document.getElementById('xp-progress-text'),
  fishingStatus: document.getElementById('fishing-status'),
  fishBtn: null,
  autoFishBtn: null
};

let revealState = {
  active: false, rolls: [], mode: 'manual', settleTimeout: null,
  readPauseTimeout: null, uiRemovalTimeout: null,
  preRevealTimeout: null
};

let isFishing = false;

let fishReadyAt = 0;
let fishWaitHintTimeout = null;

const audioEls = {};

function safePlay(audio) {
  try {
    const p = audio.play();
    if (p && typeof p.then === 'function') p.catch(() => {});
    return p;
  } catch (e) { return undefined; }
}

function playUiSound(key) {
  const audio = audioEls[key];
  if (!audio || gameState.uiVolume <= 0) return;
  try { audio.currentTime = 0; } catch (e) { }
  safePlay(audio);
}

function initAudio() {
  audioEls.close = document.getElementById('close-sound');
  audioEls.tick = document.getElementById('tick-sound');

  const applyVolumes = () => {
    ['close', 'tick'].forEach(k => { if (audioEls[k]) audioEls[k].volume = gameState.uiVolume; });
  };
  applyVolumes();

  const uiSlider = document.getElementById('ui-volume');
  if (uiSlider) {
    uiSlider.value = gameState.uiVolume;
    uiSlider.addEventListener('input', () => {
      gameState.uiVolume = parseFloat(uiSlider.value);
      applyVolumes();
      saveState();
    });
  }

  const CLOSE_SOUND_BUTTONS = new Set(['close-settings-btn', 'skilltree-close-btn']);
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('.pixel-btn');
    if (target && CLOSE_SOUND_BUTTONS.has(target.id)) playUiSound('close');
  });
}

function migrateLegacySave(data) {
  const isPreRewrite = !data.saveVersion || data.saveVersion < 2;

  if (isPreRewrite) {
    const remapEntries = (obj) => {
      const remapped = {};
      Object.entries(obj || {}).forEach(([key, value]) => {
        let fishName = value.fishName || key.split('|')[1] || key;
        let isShiny = false;
        if (fishName && fishName.includes('(shiny)')) {
          isShiny = true;
          fishName = fishName.replace(' (shiny)', '');
        }
        const fishId = LEGACY_NAME_TO_ID[fishName];
        if (!fishId) return;
        const newKey = isShiny ? `${fishId}|shiny` : fishId;
        if (!remapped[newKey]) {
          remapped[newKey] = { fishId, isShiny, count: 0, minWeight: null, maxWeight: null };
        }
        remapped[newKey].count += value.count || 0;
      });
      return remapped;
    };

    data.inventory = remapEntries(data.inventory);
    data.fishIndex = remapEntries(data.fishIndex);

    const newShards = {};
    Object.keys(data.collectedShards || {}).forEach(id => {
      const shard = relicShards.find(s => s.id === Number(id));
      if (shard) newShards[id] = shard;
    });
    data.collectedShards = newShards;

    if (data.achievements && data.achievements['triforce_courageComplete']) {
      delete data.achievements['triforce_courageComplete'];
      data.achievements['relic_tideheartComplete'] = true;
    }

    const grandfathered = locations.filter(l => (data.level || 1) >= l.unlockLevel).map(l => l.id);
    data.unlockedLocations = grandfathered.length > 0 ? grandfathered : ['shallows'];
    data.currentLocation = data.unlockedLocations[data.unlockedLocations.length - 1];
    data.autoSellRarity = 'none';
    data.lastSeen = Date.now();
  }

  if (!data.saveVersion || data.saveVersion < 3) {
    delete data.comboCount;
    delete data.lastFishType;
    delete data.sameTypeCombo;
    delete data.perfectHits;
    if (data.achievements) delete data.achievements['skill_perfectSlider'];
    data.revealSpeedLevel = data.revealSpeedLevel || 0;
    data.castStreak = data.castStreak || 0;
    data.lastManualCastAt = data.lastManualCastAt || 0;
  }

  if (!data.saveVersion || data.saveVersion < 4) {
    delete data.renownNudgeShown;
    data.skillPoints = data.skillPoints || 0;
    data.skillTreeUnlocked = data.skillTreeUnlocked || {};
    data.skillTreeCycleLevels = data.skillTreeCycleLevels || {};
    if (data.autoSellMaxWeight === undefined) data.autoSellMaxWeight = null;
  }

  if (!data.saveVersion || data.saveVersion < 5) {
    data.rebirthCount = data.rebirthCount || 0;
    data.rebirthPoints = data.rebirthPoints || 0;
  }

  if (!data.saveVersion || data.saveVersion < 6) {
    data.tutorialCompleted = true;
    data.tutorialStep = null;
  }

  if (!data.saveVersion || data.saveVersion < 7) {
    if (data.rupees !== undefined) { data.coins = data.rupees; delete data.rupees; }
    if (data.mon !== undefined) { data.pearls = data.mon; delete data.mon; }
    if (data.monSpent !== undefined) { data.pearlsSpent = data.monSpent; delete data.monSpent; }
    if (data.lifetimeRupeesEarned !== undefined) { data.lifetimeCoinsEarned = data.lifetimeRupeesEarned; delete data.lifetimeRupeesEarned; }
  }

  if (!data.saveVersion || data.saveVersion < 8) {
    if (data.skillPoints !== undefined) {
      data.rebirthPoints = (data.rebirthPoints || 0) + data.skillPoints;
      delete data.skillPoints;
    }
  }

  data.saveVersion = SAVE_VERSION;
  return data;
}


let knownSaveRevision = 0;

let adoptGeneration = 0;

let externalWriteGeneration = 0;

let contentBase = cloneSaveContent(gameState);

function saveContentProjection(payload) {
  const normalized = {};
  Object.keys(payload).forEach(key => {
    if (key === 'saveRevision' || key === 'lastSeen') return;
    let value = payload[key];
    if (key === 'activePotions' && value && typeof value === 'object' && !Array.isArray(value)) {
      const now = Date.now();
      const potions = {};
      Object.keys(value).forEach(type => {
        const stamp = value[type];
        potions[type] = typeof stamp === 'number' && stamp <= now ? 0 : stamp;
      });
      value = potions;
    }
    normalized[key] = value;
  });
  return JSON.stringify(canonicalizeKeys(normalized));
}

function canonicalizeKeys(value) {
  if (Array.isArray(value)) return value.map(canonicalizeKeys);
  if (value && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach(k => { sorted[k] = canonicalizeKeys(value[k]); });
    return sorted;
  }
  return value;
}

function cloneSaveContent(payload) {
  return JSON.parse(JSON.stringify(payload));
}

const SAVE_CONTAINER_TYPES = {
  inventory: 'object',
  fishIndex: 'object',
  junkIndex: 'object',
  collectedShards: 'object',
  achievements: 'object',
  skillTreeUnlocked: 'object',
  skillTreeCycleLevels: 'object',
  activePotions: 'object',
  temporaryBoosts: 'object',
  unlockedLocations: 'array',
};

const SAVE_SCALAR_TYPES = {
  coins: 'number', pearls: 'number', xp: 'number',
  totalSpent: 'number', pearlsSpent: 'number', lifetimeCoinsEarned: 'number',
  lastSeen: 'number', lastManualCastAt: 'number',
  musicVolume: 'number', uiVolume: 'number',
  heaviestCatch: 'number|null', autoSellMaxWeight: 'number|null',
  level: 'integer', lifetimeFish: 'integer', timesFished: 'integer',
  reelSpeedLevel: 'integer', luckLevel: 'integer', revealSpeedLevel: 'integer',
  renownLevel: 'integer', idleEfficiencyLevel: 'integer',
  junkCaught: 'integer', castStreak: 'integer', offlineCatchesLifetime: 'integer',
  rebirthCount: 'integer', rebirthPoints: 'integer',
  autoFishUnlocked: 'boolean', tripleHookUnlocked: 'boolean',
  tutorialCompleted: 'boolean',
};

const SAVE_ENTRY_FIELD_TYPES = {
  inventory: { count: 'integer', pinned: 'boolean' },
  fishIndex: { count: 'integer', minWeight: 'number|null', maxWeight: 'number|null' },
};

function describeSaveValue(value) {
  return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}

function saveValueMatches(value, kind) {
  switch (kind) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isInteger(value);
    case 'number|null': return value === null || (typeof value === 'number' && Number.isFinite(value));
    case 'boolean': return typeof value === 'boolean';
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    default: return false;
  }
}

const LUCK_MAX_LEVEL = 3;

function normalizeLuckLevel(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(LUCK_MAX_LEVEL, Math.max(0, Math.floor(n)));
}

function parseAndMigrateSave(raw) {
  let data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('save root must be an object');
  if (!data.saveVersion || data.saveVersion < SAVE_VERSION) data = migrateLegacySave(data);
  if (data.luckLevel !== undefined) data.luckLevel = normalizeLuckLevel(data.luckLevel);
  return data;
}

function validateSaveData(data) {
  for (const [field, kind] of Object.entries(SAVE_CONTAINER_TYPES)) {
    const value = data[field];
    if (value === undefined) continue;
    const ok = kind === 'array'
      ? Array.isArray(value)
      : typeof value === 'object' && value !== null && !Array.isArray(value);
    if (!ok) {
      const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      throw new Error(`save field "${field}" is ${actual}, expected ${kind}`);
    }
  }

  for (const [field, kind] of Object.entries(SAVE_SCALAR_TYPES)) {
    const value = data[field];
    if (value === undefined) continue;
    if (!saveValueMatches(value, kind)) {
      throw new Error(`save field "${field}" is ${describeSaveValue(value)}, expected ${kind}`);
    }
  }

  for (const [field, propKinds] of Object.entries(SAVE_ENTRY_FIELD_TYPES)) {
    const entries = data[field];
    if (entries === undefined) continue;
    for (const [key, entry] of Object.entries(entries)) {
      if (!saveValueMatches(entry, 'object')) {
        throw new Error(`save field "${field}.${key}" is ${describeSaveValue(entry)}, expected object`);
      }
      for (const [prop, kind] of Object.entries(propKinds)) {
        const value = entry[prop];
        if (value === undefined) continue;
        if (!saveValueMatches(value, kind)) {
          throw new Error(`save field "${field}.${key}.${prop}" is ${describeSaveValue(value)}, expected ${kind}`);
        }
      }
    }
  }

  const chum = data.chumBoost;
  if (chum !== undefined && chum !== null) {
    if (!saveValueMatches(chum, 'object')) {
      throw new Error(`save field "chumBoost" is ${describeSaveValue(chum)}, expected object|null`);
    }
    for (const [prop, kind] of Object.entries({ value: 'number', remaining: 'integer' })) {
      const v = chum[prop];
      if (v === undefined) continue;
      if (!saveValueMatches(v, kind)) {
        throw new Error(`save field "chumBoost.${prop}" is ${describeSaveValue(v)}, expected ${kind}`);
      }
    }
  }

  const cycleLevels = data.skillTreeCycleLevels;
  if (cycleLevels !== undefined) {
    for (const [id, level] of Object.entries(cycleLevels)) {
      if (level === undefined) continue;
      if (!saveValueMatches(level, 'integer')) {
        throw new Error(`save field "skillTreeCycleLevels.${id}" is ${describeSaveValue(level)}, expected integer`);
      }
    }
  }
}

function hydrateState(data) {
  const loaded = data.saveRevision;
  delete data.saveRevision;
  Object.assign(gameState, data);

  Object.values(ACHIEVEMENTS).forEach(category => {
    Object.values(category).forEach(ach => { ach.unlocked = false; });
  });
  Object.keys(gameState.achievements).forEach(key => {
    const [category, achKey] = key.split('_');
    if (ACHIEVEMENTS[category] && ACHIEVEMENTS[category][achKey]) {
      ACHIEVEMENTS[category][achKey].unlocked = true;
    }
  });

  if (!Array.isArray(gameState.unlockedLocations) || gameState.unlockedLocations.length === 0) {
    gameState.unlockedLocations = ['shallows'];
  }
  if (!locations.some(l => l.id === gameState.currentLocation)) {
    gameState.currentLocation = 'shallows';
  }

  const storedLastSeen = typeof data.lastSeen === 'number' ? data.lastSeen : 0;
  potionClockAnchor = Math.max(potionClockAnchor || 0, storedLastSeen) || null;
  boundPotionStamps();

  knownSaveRevision = Number.isFinite(loaded) && loaded >= 0 ? loaded : 0;
  contentBase = cloneSaveContent(gameState);
}

function resetRuntimeToPristine() {
  Object.assign(gameState, JSON.parse(JSON.stringify(PRISTINE_GAME_STATE)));
  Object.values(ACHIEVEMENTS).forEach(category => {
    Object.values(category).forEach(ach => { ach.unlocked = false; });
  });
  knownSaveRevision = 0;
  contentBase = cloneSaveContent(gameState);
}

let quarantineFailed = false;

function quarantineRawSave(raw, fromBackup) {
  if (fromBackup) return true;
  try {
    localStorage.setItem(SAVE_BACKUP_KEY, raw);
    localStorage.removeItem(SAVE_KEY);
    quarantineFailed = false;
    return true;
  } catch (e) {
    console.error('Could not move the unreadable save to the backup key; keeping it in place.', e);
    quarantineFailed = true;
    warnSaveFailure(e);
    return false;
  }
}

function storedRevision(raw) {
  if (raw === null) return -1;
  try {
    const parsed = JSON.parse(raw);
    const rev = parsed && parsed.saveRevision;
    return Number.isFinite(rev) && rev >= 0 ? rev : 0;
  } catch {
    return -1;
  }
}

function isReadableStoredSave(raw) {
  try {
    validateSaveData(parseAndMigrateSave(raw));
    return true;
  } catch {
    return false;
  }
}

function classifyStaleStored(raw) {
  if (contentBase === null) return { action: 'adopt' };
  let localContent;
  let baseContent;
  try {
    localContent = saveContentProjection(gameState);
    baseContent = saveContentProjection(contentBase);
  } catch (e) {
    return { action: 'adopt' };
  }
  if (localContent === baseContent) return { action: 'adopt' };
  let storedData;
  try {
    storedData = parseAndMigrateSave(raw);
    validateSaveData(storedData);
  } catch (e) {
    return { action: 'adopt' };
  }
  if (saveContentProjection(storedData) !== baseContent) return { action: 'adopt' };
  return {
    action: 'fastforward',
    storedLastSeen: Number.isFinite(storedData.lastSeen) ? storedData.lastSeen : 0
  };
}

function fastForwardPastContentFreeWrite(storedRev, storedLastSeen) {
  knownSaveRevision = storedRev;
  gameState.lastSeen = Math.max(gameState.lastSeen || 0, storedLastSeen || 0);
  externalWriteGeneration++;
}

function adoptStoredSave(raw) {
  try {
    const data = parseAndMigrateSave(raw);
    validateSaveData(data);
    hydrateState(data);
    adoptGeneration++;
    startTutorialIfNeeded();
    updateAllUI();
    console.info(`Another tab saved a newer snapshot (revision ${knownSaveRevision}); adopted it instead of overwriting.`);
    return true;
  } catch (e) {
    console.error('Newer stored save could not be adopted; skipping this write rather than overwriting it.', e);
    return false;
  }
}

let loadRenderer = updateAllUI;
function setLoadRenderer(fn) {
  loadRenderer = fn || updateAllUI;
}

function migrateLegacySaveKey() {
  let legacyRaw;
  try {
    legacyRaw = localStorage.getItem(LEGACY_SAVE_KEY);
  } catch {
    return;
  }
  if (legacyRaw === null) return;

  let stored;
  try {
    stored = localStorage.getItem(SAVE_KEY);
  } catch {
    return;
  }
  if (stored !== null) return;

  try {
    localStorage.setItem(SAVE_KEY, legacyRaw);
  } catch (e) {
    console.error('Legacy save migration could not copy the save; keeping it under the legacy key.', e);
    warnSaveFailure(e);
    return;
  }
  let verified;
  try {
    verified = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    console.error('Legacy save migration could not verify the copy; keeping the legacy save in place.', e);
    return;
  }
  if (verified !== legacyRaw) {
    console.error('Legacy save migration read back different bytes than it wrote; keeping both saves in place.');
    return;
  }
  try {
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch (e) {
    console.error('Migrated save verified, but the legacy key could not be removed; it will be ignored while the Deepwater save exists.', e);
  }
}

function loadState() {
  migrateLegacySaveKey();

  let mainRaw;
  let raw;
  let fromBackup;
  try {
    mainRaw = localStorage.getItem(SAVE_KEY);
    fromBackup = mainRaw === null;
    raw = fromBackup ? localStorage.getItem(SAVE_BACKUP_KEY) : mainRaw;
  } catch (e) {
    warnSaveFailure(e);
    startTutorialIfNeeded();
    updateAllUI();
    return;
  }
  if (!raw) {
    startTutorialIfNeeded();
    updateAllUI();
    return;
  }

  try {
    const data = parseAndMigrateSave(raw);
    validateSaveData(data);
    hydrateState(data);
  } catch (e) {
    console.error('Save data was corrupted, starting fresh.', e);
    quarantineRawSave(raw, fromBackup);
    resetRuntimeToPristine();
    startTutorialIfNeeded();
    updateAllUI();
    return;
  }

  try {
    applyOfflineProgress();
  } catch (e) {
    console.error('Offline progress failed to apply; continuing with the loaded state.', e);
  }

  startTutorialIfNeeded();

  try {
    loadRenderer();
  } catch (e) {
    console.error('UI failed to render the loaded state; the persisted save was left intact.', e);
  }
}

let saveFailureWarned = false;

function warnSaveFailure(e) {
  console.error('Failed to save progress', e);
  if (!saveFailureWarned) {
    saveFailureWarned = true;
    showNotification(pxIcon('save') + ' Could not save your progress: your browser may be blocking storage.', 'rare');
  }
}

function saveState() {
  let stored = null;
  try {
    stored = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    warnSaveFailure(e);
    return;
  }

  if (quarantineFailed) {
    if (stored !== null && !isReadableStoredSave(stored)) {
      if (!quarantineRawSave(stored, false)) return;
      stored = null;
    } else {
      quarantineFailed = false;
    }
  }

  const rev = storedRevision(stored);
  if (rev > knownSaveRevision) {
    const decision = classifyStaleStored(stored);
    if (decision.action !== 'fastforward') {
      adoptStoredSave(stored);
      return;
    }
    fastForwardPastContentFreeWrite(rev, decision.storedLastSeen);
  }

  const nextRev = Math.max(rev, knownSaveRevision) + 1;
  gameState.lastSeen = document.hidden
    ? Math.max(gameState.lastSeen || 0, hiddenSince || 0, lastCatchResolvedAt || 0)
    : Date.now();
  Object.keys(gameState.activePotions).forEach(k => isPotionActive(k));
  const stampReference = potionClockAnchor;
  const serializationGap = gameState.lastSeen - stampReference;
  let serializedPotions = null;
  if (serializationGap > 0) {
    serializedPotions = {};
    Object.keys(gameState.activePotions).forEach(type => {
      const stamp = gameState.activePotions[type];
      serializedPotions[type] = (typeof stamp === 'number' && stamp > 0)
        ? stamp + serializationGap
        : stamp;
    });
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializedPotions
      ? { ...gameState, activePotions: serializedPotions, saveRevision: nextRev }
      : { ...gameState, saveRevision: nextRev }));
    knownSaveRevision = nextRev;
    contentBase = cloneSaveContent(gameState);
  } catch (e) {
    warnSaveFailure(e);
  }
}

setInterval(saveState, 30000);

const CYCLE_NODE_COST_GROWTH = 1.75;

function getSkillNodeLevel(id) {
  if (!gameState.skillTreeUnlocked[id]) return 0;
  const node = getNodeById(id);
  if (!node || node.tier !== 'cycle') return 1;
  return 1 + (gameState.skillTreeCycleLevels[id] || 0);
}

function getCycleNodeRpCost(level) {
  return Math.min(1 + Math.floor(level / 5), 3);
}

function getCycleCurrencyCombo(nodeId, level) {
  let h = 0;
  const s = `${nodeId}:${level}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const roll = h % 3;
  return roll === 0 ? 'coins' : roll === 1 ? 'pearls' : 'both';
}

function getCycleNodeCost(node, level) {
  const growth = Math.pow(CYCLE_NODE_COST_GROWTH, level);
  const combo = getCycleCurrencyCombo(node.id, level);
  const cost = { rebirthPoints: getCycleNodeRpCost(level) };
  if (combo === 'coins' || combo === 'both') cost.coins = Math.round((node.cost.coins || 0) * growth);
  if (combo === 'pearls' || combo === 'both') cost.pearls = Math.round((node.cost.pearls || 0) * growth);
  return cost;
}

function getSkillEffectSum(effectType) {
  let total = 0;
  Object.keys(gameState.skillTreeUnlocked).forEach(id => {
    const node = getNodeById(id);
    if (!node || !node.effect || node.effect.type !== effectType) return;
    total += node.effect.value * getSkillNodeLevel(id);
  });
  return total;
}

function hasSkillEffect(effectType) {
  return Object.keys(gameState.skillTreeUnlocked).some(id => {
    const node = getNodeById(id);
    return node && node.effect && node.effect.type === effectType;
  });
}

function getSkillNodeCost(node) {
  if (node.tier === 'cycle') return getCycleNodeCost(node, getSkillNodeLevel(node.id));
  return { ...(node.cost || {}) };
}

function purchaseSkillNode(id) {
  const node = getNodeById(id);
  if (!node) return false;
  const status = getNodeStatus(node, gameState.skillTreeUnlocked);
  if (status === 'silhouette') return false;
  if (status === 'owned' && node.tier !== 'cycle') return false;

  const cost = getSkillNodeCost(node);
  if (!canAffordNode({ cost }, gameState)) return false;

  if (cost.rebirthPoints) gameState.rebirthPoints -= cost.rebirthPoints;
  if (cost.coins) { gameState.coins -= cost.coins; gameState.totalSpent += cost.coins; }
  if (cost.pearls) gameState.pearls -= cost.pearls;

  if (status === 'owned') {
    gameState.skillTreeCycleLevels[id] = (gameState.skillTreeCycleLevels[id] || 0) + 1;
  } else {
    gameState.skillTreeUnlocked[id] = true;
  }

  updateAllUI();
  saveState();
  checkAchievements();
  handleTutorialNodePurchased(id);
  return true;
}

const RESPEC_COST_REBIRTH_POINTS = 5;

function getRebirthPointsSpentOnNode(node) {
  if (node.tier !== 'cycle') return node.cost.rebirthPoints || 0;
  const extraLevels = gameState.skillTreeCycleLevels[node.id] || 0;
  let spent = 0;
  for (let i = 0; i <= extraLevels; i++) spent += getCycleNodeCost(node, i).rebirthPoints;
  return spent;
}

function respecSkillTree() {
  if (gameState.rebirthPoints < RESPEC_COST_REBIRTH_POINTS) return false;

  let refund = 0;
  skillTreeNodes.forEach(node => {
    if (gameState.skillTreeUnlocked[node.id]) refund += getRebirthPointsSpentOnNode(node);
  });

  gameState.rebirthPoints -= RESPEC_COST_REBIRTH_POINTS;
  gameState.rebirthPoints += refund;
  gameState.skillTreeUnlocked = {};
  gameState.skillTreeCycleLevels = {};

  updateAllUI();
  saveState();
  return true;
}

function getMoneyDiscountMultiplier() {
  return Math.max(1 - getSkillEffectSum('moneyDiscountPercent'), 0.5);
}

function getPearlGainMultiplier() {
  return 1 + getSkillEffectSum('pearlGainPercent');
}

const REBIRTH_COST_GROWTH = 1.5;
const REBIRTH_BONUS_PER_LEVEL = 0.03;

function getRebirthCostMultiplier() {
  return Math.pow(REBIRTH_COST_GROWTH, gameState.rebirthCount);
}

function getScaledCost(base) {
  return Math.round(base * getRebirthCostMultiplier());
}

function getRebirthBonus() {
  return gameState.rebirthCount * REBIRTH_BONUS_PER_LEVEL;
}

function getRebirthPointsAward() {
  return 10 + gameState.rebirthCount * 5;
}

function canRebirth() {
  return Array.isArray(gameState.unlockedLocations) && gameState.unlockedLocations.length > 1;
}

function performRebirth() {
  if (!canRebirth()) return false;

  const adoptGenerationBefore = adoptGeneration;
  if (revealState.active) finalizeReveal();

  if (adoptGeneration !== adoptGenerationBefore) return false;

  gameState.coins = 0;
  gameState.pearls = 0;
  gameState.reelSpeedLevel = 0;
  gameState.unlockedLocations = ['shallows'];
  gameState.currentLocation = 'shallows';
  gameState.inventory = {};
  gameState.renownLevel = 0;

  skillTreeNodes.forEach(node => {
    if (node.tier === 'cycle') {
      delete gameState.skillTreeUnlocked[node.id];
      delete gameState.skillTreeCycleLevels[node.id];
    }
  });

  gameState.rebirthPoints += getRebirthPointsAward();
  gameState.rebirthCount++;

  updateAllUI();
  saveState();
  return true;
}

const TEMP_BUFF_DURATION_MS = 5 * 60 * 1000;

function isChestBuffActive(grantedAt) {
  return typeof grantedAt === 'number' && Date.now() >= grantedAt &&
    Date.now() - grantedAt < TEMP_BUFF_DURATION_MS;
}

let potionClockAnchor = null;

function boundPotionStamps() {
  const now = Date.now();
  const anchor = potionClockAnchor;
  potionClockAnchor = now;
  if (anchor === null || now >= anchor) return;
  const jump = anchor - now;
  Object.keys(gameState.activePotions).forEach(k => {
    const stamp = gameState.activePotions[k];
    if (typeof stamp === 'number' && stamp > 0) {
      gameState.activePotions[k] = stamp - jump;
    }
  });
}

function isPotionActive(type) {
  boundPotionStamps();
  const now = Date.now();
  const stamp = gameState.activePotions[type];
  if (typeof stamp !== 'number') return false;
  if (now < stamp) return true;
  if (stamp !== 0) gameState.activePotions[type] = 0;
  return false;
}

function getTotalLuck() {
  let total = 0;
  const tierBonuses = [0.0333, 0.0333, 0.0334];
  const luckTiers = normalizeLuckLevel(gameState.luckLevel);
  for (let i = 0; i < luckTiers; i++) total += tierBonuses[i];
  Object.values(gameState.collectedShards).forEach(s => {
    if (s.type === 'luck') total += s.value;
  });
  if (isPotionActive('luck')) total += 0.10;
  if (isChestBuffActive(gameState.temporaryBoosts.luckGrantedAt)) total += gameState.temporaryBoosts.luck;
  if (gameState.chumBoost && gameState.chumBoost.remaining > 0) total += gameState.chumBoost.value;
  total += getSkillEffectSum('luckFlat') + getSkillEffectSum('luckPercent');
  total += getRebirthBonus();
  return total;
}

function getReelSpeedBonus() {
  let percent = 0;
  Object.values(gameState.collectedShards).forEach(s => {
    if (s.type === 'reelSpeed') percent += s.value;
  });
  if (isPotionActive('reel')) percent += 0.20;
  if (isChestBuffActive(gameState.temporaryBoosts.reelSpeedGrantedAt)) percent += (gameState.temporaryBoosts.reelSpeed || 0) * 0.01;
  percent += getRebirthBonus();
  return Math.min(percent, 0.5);
}

function getCastTimeMs() {
  const base = ROD_CAST_MS[Math.min(gameState.reelSpeedLevel, ROD_CAST_MS.length - 1)];
  return Math.round(base * (1 - getReelSpeedBonus()));
}

const REVEAL_BASE_MS = 3400;
const REVEAL_MS_PER_LEVEL = 120;
const REVEAL_MIN_MS = 1200;
const AUTO_FISH_REVEAL_MULTIPLIER = 1.25;

const REVEAL_LEGENDARY_MIN_MS = 1675;

function getRevealDurationMs(rolls = null) {
  const ms = getBaseRevealDurationMs();
  return rolls && rolls.some(isPreRevealRoll) ? Math.max(ms, REVEAL_LEGENDARY_MIN_MS) : ms;
}

function getBaseRevealDurationMs() {
  let ms = REVEAL_BASE_MS - gameState.revealSpeedLevel * REVEAL_MS_PER_LEVEL - getSkillEffectSum('revealSpeedFlatMs');
  if (gameState.tripleHookUnlocked) ms -= getSkillEffectSum('tripleHookRevealBonusMs');
  ms += getCastTimeMs();
  return Math.max(ms, REVEAL_MIN_MS);
}

function getAutoFishRevealDurationMs(rolls = null) {
  return Math.round(getRevealDurationMs(rolls) * AUTO_FISH_REVEAL_MULTIPLIER);
}

const STREAK_WINDOW_MS = 8000;
const STREAK_DECAY_THRESHOLD_MS = 20000;
const STREAK_MULTIPLIER_PER_STACK = 0.1;
const STREAK_MULTIPLIER_CAP = 1.0;

function registerManualCast() {
  const now = Date.now();
  const gap = now - gameState.lastManualCastAt;
  if (gameState.lastManualCastAt > 0 && gap <= STREAK_WINDOW_MS) {
    gameState.castStreak++;
  } else if (gameState.lastManualCastAt === 0 || gap > getStreakDecayThresholdMs()) {
    gameState.castStreak = 0;
  }
  gameState.lastManualCastAt = now;
}

function getStreakDecayThresholdMs() {
  return STREAK_DECAY_THRESHOLD_MS + getSkillEffectSum('streakDecayBonusMs');
}

function getStreakMultiplier() {
  return 1 + Math.min(gameState.castStreak * STREAK_MULTIPLIER_PER_STACK, STREAK_MULTIPLIER_CAP);
}

function getInventoryCap() {
  return 100 + getSkillEffectSum('bagCapacityFlat');
}

function getCappedInventoryCount() {
  const overflowCommon = hasSkillEffect('unlockCommonOverflow');
  const overflowRare = hasSkillEffect('unlockRareOverflow');
  const overflowPinned = hasSkillEffect('unlockPinOverflow');
  if (!overflowCommon && !overflowRare && !overflowPinned) return getTotalInventoryCount();

  return Object.values(gameState.inventory).reduce((sum, item) => {
    if (overflowPinned && item.pinned) return sum;
    const fish = getFishById(item.fishId);
    if (overflowCommon && fish && fish.rarity === 'Common') return sum;
    if (overflowRare && fish && fish.rarity === 'Rare') return sum;
    return sum + item.count;
  }, 0);
}

function getCurrentLocation() {
  return getLocationById(gameState.currentLocation);
}

function getTotalInventoryCount() {
  return Object.values(gameState.inventory).reduce((sum, fish) => sum + fish.count, 0);
}

const numberFormatterPlain = new Intl.NumberFormat('en-US');
const numberFormatterCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function formatNumber(n) {
  n = n || 0;
  return Math.abs(n) < 10000 ? numberFormatterPlain.format(Math.floor(n)) : numberFormatterCompact.format(n);
}

function formatWeight(w) {
  if (w === null || w === undefined) return '?';
  return `${w.toFixed(1)} lb`;
}

function getFishImage(fishId) {
  const fish = getFishById(fishId);
  return fish ? `assets/fish/${fish.image}` : 'assets/fish/harbor_bass.png';
}

function rarityIndex(name) {
  return RARITY_ORDER.indexOf(name);
}

function unlockAchievement(category, key) {
  if (!ACHIEVEMENTS[category] || !ACHIEVEMENTS[category][key]) return;
  const ach = ACHIEVEMENTS[category][key];
  if (gameState.achievements[`${category}_${key}`]) {
    ach.unlocked = true;
    return;
  }

  ach.unlocked = true;
  gameState.achievements[`${category}_${key}`] = true;
  gameState.pearls += ach.reward;
  if (ach.rebirthPointReward) gameState.rebirthPoints += ach.rebirthPointReward;
  playSfx('achievement');

  const rpText = ach.rebirthPointReward ? ` and +${ach.rebirthPointReward} Skill Point${ach.rebirthPointReward > 1 ? 's' : ''}` : '';
  showNotification(`${pxIcon('trophy')} ${ach.name} unlocked! +${ach.reward} Pearls${rpText}`, 'achievement');
  updateAllUI();
  saveState();
}

function checkAchievements() {
  if (gameState.lifetimeFish >= 1) unlockAchievement('catch', 'firstCatch');
  if (gameState.heaviestCatch >= 20) unlockAchievement('catch', 'bigCatch');
  if (gameState.heaviestCatch >= 50) unlockAchievement('catch', 'monsterCatch');
  if (gameState.lifetimeFish >= 100) unlockAchievement('quantity', 'busyBeaver');
  if (gameState.lifetimeFish >= 500) unlockAchievement('quantity', 'fishingFrenzy');
  if (gameState.lifetimeFish >= 1000) unlockAchievement('quantity', 'lifetimeAngler');

  const uniqueSpecies = Object.keys(gameState.fishIndex).filter(k => !k.includes('|shiny')).length;
  if (uniqueSpecies >= 10) unlockAchievement('catch', 'collector');
  if (fishCatalogue.every(f => gameState.fishIndex[f.id])) unlockAchievement('catch', 'anglerMaster');

  const lifetimeShinyCatches = Object.keys(gameState.fishIndex)
    .filter(k => k.includes('|shiny'))
    .reduce((sum, k) => sum + (Number(gameState.fishIndex[k]?.count) || 0), 0);
  if (lifetimeShinyCatches >= 1) unlockAchievement('shiny', 'shinyHunter');
  if (lifetimeShinyCatches >= 10) unlockAchievement('shiny', 'shinyCollector');

  if (gameState.reelSpeedLevel >= 3) unlockAchievement('skill', 'reelSpeedDemon');
  if (gameState.luckLevel >= 3) unlockAchievement('skill', 'luckyAngler');
  if (gameState.renownLevel >= 5) unlockAchievement('skill', 'renownedAngler');

  if (gameState.autoFishUnlocked) unlockAchievement('upgrade', 'autoFishOwner');
  if (gameState.totalSpent >= 50000) unlockAchievement('upgrade', 'bigSpender');
  if (gameState.pearlsSpent >= 1000) unlockAchievement('upgrade', 'treasureHunter');

  if (Object.keys(gameState.collectedShards).length === 8) unlockAchievement('relic', 'tideheartComplete');
  if (gameState.unlockedLocations.length >= locations.length) unlockAchievement('location', 'explorer');

  const bait = getCurrentBait();
  if (bait.tier >= 1) unlockAchievement('gear', 'baitBeginner');
  if (bait.tier >= 2) unlockAchievement('gear', 'lurePro');
  if (bait.tier >= 3) unlockAchievement('gear', 'lureMaster');

  if (gameState.junkCaught >= 10) unlockAchievement('junk', 'beachcomber');
  if (Object.keys(gameState.junkIndex).length >= junkCatalogue.length) unlockAchievement('junk', 'fullCollection');
}

const notifications = [];

function getNotificationTopOffset() {
  const bar = document.getElementById('stats-bar');
  const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
  return Math.max(12, Math.round(barBottom) + 8);
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function showNotification(message, kind = 'normal', durationMs = null) {
  const notif = document.createElement('div');
  notif.innerHTML = message;
  notif.setAttribute('role', 'status');
  const palette = {
    normal: { bg: '#2a2f44', border: '#ffd700', color: '#ffd700' },
    discovery: { bg: '#26314a', border: '#4fd1a5', color: '#4fd1a5' },
    achievement: { bg: '#2a2f44', border: '#ffd700', color: '#ffd700' },
    rare: { bg: '#33243f', border: '#e67e22', color: '#ffe4c4' }
  }[kind] || { bg: '#2a2f44', border: '#ffd700', color: '#ffd700' };

  const topBase = getNotificationTopOffset();
  const reduceMotion = prefersReducedMotion();

  notif.style.cssText = `
    position: fixed; top: ${topBase}px; right: 20px; pointer-events: none;
    background: ${palette.bg}; color: ${palette.color};
    padding: 1em 1.5em; border-radius: 8px; border: 2px solid ${palette.border};
    z-index: 4500; font-family: 'Press Start 2P', monospace; font-size: 0.8em;
    margin-top: 0.5em; opacity: ${reduceMotion ? 1 : 0}; transform: ${reduceMotion ? 'none' : 'translateX(100%)'};
    transition: ${reduceMotion ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'}; box-shadow: 0 4px 18px rgba(0,0,0,0.5);
    max-width: 320px; line-height: 1.5;
  `;

  document.body.appendChild(notif);
  notifications.push(notif);
  layoutNotifications();
  if (notificationResizeObserver) notificationResizeObserver.observe(notif);

  if (!reduceMotion) requestAnimationFrame(() => {
    notif.style.opacity = 1;
    notif.style.transform = 'translateX(0)';
  });

  notif._dismissTimer = setTimeout(() => dismissNotification(notif), durationMs ?? (kind === 'discovery' ? 4500 : 3000));
}

const notificationResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layoutNotifications()) : null;

function layoutNotifications() {
  const gap = 6;
  const bottomLimit = window.innerHeight * 0.6;
  const heightOf = n => n.offsetHeight + gap;
  let total = notifications.reduce((sum, n) => sum + (n._leaving ? 0 : heightOf(n)), getNotificationTopOffset());
  for (const n of notifications) {
    if (total <= bottomLimit || notifications.filter(x => !x._leaving).length <= 1) break;
    if (n._leaving) continue;
    total -= heightOf(n);
    dismissNotification(n);
  }
  let top = getNotificationTopOffset();
  for (const n of notifications) {
    if (n._leaving) continue;
    n.style.top = `${top}px`;
    top += heightOf(n);
  }
}

function dismissNotification(notif) {
  if (notif._leaving) return;
  notif._leaving = true;
  clearTimeout(notif._dismissTimer);
  notif.style.opacity = 0;
  notif.style.transform = 'translateX(100%)';
  setTimeout(() => {
    if (notificationResizeObserver) notificationResizeObserver.unobserve(notif);
    notif.remove();
    const i = notifications.indexOf(notif);
    if (i >= 0) notifications.splice(i, 1);
    layoutNotifications();
  }, 300);
}

function showFloatingReward(text, color, extraClass = '') {
  const scene = document.getElementById('fishing-scene');
  if (!scene) return;
  const live = scene.querySelectorAll('.floating-reward');
  for (let i = 0; i <= live.length - 4; i++) live[i].remove();
  const el = document.createElement('div');
  el.className = `floating-reward ${extraClass}`.trim();
  el.textContent = text;
  el.style.cssText = `
    position: absolute; left: 50%; top: 45%; transform: translate(-50%, 0);
    color: ${color}; font-family: 'Press Start 2P', monospace; font-size: ${extraClass === 'floating-reward-big' ? '1.25em' : '0.9em'};
    text-shadow: 0 2px 4px #000; pointer-events: none; z-index: 50;
    animation: float-up-fade 1.1s ease-out forwards;
  `;
  scene.appendChild(el);
  setTimeout(() => el.remove(), 1150);
}

function addRecentCatchEntry(html, color) {
  const container = document.getElementById('recent-fish-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'recent-fish-entry';
  el.style.color = color || '#fffbe7';
  if (color) el.style.borderColor = color;
  el.innerHTML = html;
  container.appendChild(el);
  while (container.children.length > 4) container.removeChild(container.firstChild);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    setTimeout(() => el.remove(), 500);
  }, 4000);
}

// A GIF restarts from frame 0 only when loaded from a fresh URL — each play mints its own object URL from one cached Blob and revokes it after one cycle.
const PRE_REVEAL_RARITIES = ['Legendary', 'Mythical', 'Secret'];
const PRE_REVEAL_IMAGE = 'assets/fx/pre-reveal.png';
const REVEAL_FX = { vortex: 'assets/fx/vortex.gif', bigHit: 'assets/fx/big-hit.gif' };
const REVEAL_FX_MS = 1200;
const REVEAL_FX_ART = {
  vortex: { aspect: 429 / 429, dx: 0.0035, dy: 0.0005 },
  bigHit: { aspect: 528 / 516, dx: 0.0321, dy: 0.0230 },
};
const VORTEX_PEAK_MS = 600;
const revealFxBlobs = {};

function isPreRevealRoll(roll) {
  if (!roll) return false;
  if (roll.kind === 'relic') return true;
  return roll.kind === 'fish' && PRE_REVEAL_RARITIES.includes(roll.rarity.name);
}

function loadRevealFx() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || typeof URL.createObjectURL !== 'function') return;
  Object.entries(REVEAL_FX).forEach(([key, src]) => {
    window.fetch(src).then(r => (r.ok ? r.blob() : Promise.reject(new Error(src))))
      .then(blob => { revealFxBlobs[key] = blob; })
      .catch(() => { });
  });
}

const VORTEX_SIZE = 2.0;
const BIG_HIT_SIZE = 8.0;
function playRevealGif(key, anchor, sizeFactor, slot) {
  const scene = document.getElementById('fishing');
  if (!scene || !anchor || prefersReducedMotion()) return;
  scene.querySelectorAll(`.reveal-fx-${key}[data-slot="${slot}"]`).forEach(el => el.remove());
  const s = scene.getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const cell = anchor.closest('.reveal-window')?.querySelector('.reveal-cell');
  const size = Math.round((cell ? cell.getBoundingClientRect().width : a.width) * sizeFactor);
  const img = document.createElement('img');
  img.className = `reveal-fx reveal-fx-${key}`;
  img.dataset.slot = String(slot);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  const art = REVEAL_FX_ART[key] || { aspect: 1, dx: 0, dy: 0 };
  const width = size, height = Math.round(size * art.aspect);
  img.style.width = `${width}px`;
  img.style.height = `${height}px`;
  img.style.left = `${Math.round(a.left + a.width / 2 - s.left - width / 2 - art.dx * width)}px`;
  img.style.top = `${Math.round(a.top + a.height / 2 - s.top - height / 2 - art.dy * height)}px`;
  const blob = revealFxBlobs[key];
  const url = blob ? URL.createObjectURL(blob) : REVEAL_FX[key];
  img.src = url;
  scene.appendChild(img);
  setTimeout(() => { img.remove(); if (blob) URL.revokeObjectURL(url); }, REVEAL_FX_MS);
}

function startPreRevealVortex() {
  revealState.preRevealTimeout = null;
  if (!revealState.active) return;
  revealState.rolls.forEach((roll, i) => {
    if (!isPreRevealRoll(roll)) return;
    const pointer = document.querySelector(`#reveal-strip-${i}`)?.parentElement?.querySelector('.reveal-pointer');
    playRevealGif('vortex', pointer, VORTEX_SIZE, i);
  });
}

function schedulePreReveal(msUntilLanding) {
  clearTimeout(revealState.preRevealTimeout);
  revealState.preRevealTimeout = null;
  if (!revealState.rolls.some(isPreRevealRoll) || prefersReducedMotion()) return;
  const chargeLeadMs = REVEAL_HIT_SEC * 1000;
  const startInMs = msUntilLanding >= chargeLeadMs ? msUntilLanding - chargeLeadMs : Math.max(0, msUntilLanding - VORTEX_PEAK_MS);
  revealState.preRevealTimeout = setTimeout(startPreRevealVortex, startInMs);
}

function shakeFishingScreen() {
  if (prefersReducedMotion()) return;
  replayAnimationClass(document.getElementById('fishing'), 'fx-shake');
}

const PIXEL_FIREWORK_TIERS = {
  'land-rare': [[6, 18, 0, 'rarity']],
  'land-epic': [[10, 30, 0, 'rarity'], [5, 14, 60, 'white']],
  'land-legendary': [[12, 46, 0, 'rarity'], [8, 28, 70, 'gold'], [8, 38, 170, 'white']],
};
function launchPixelFirework(cell, tierClass, color) {
  const rings = PIXEL_FIREWORK_TIERS[tierClass];
  const scene = document.getElementById('fishing-scene');
  if (!rings || !cell || !scene || prefersReducedMotion()) return;
  const live = scene.querySelectorAll('.pixel-firework');
  for (let i = 0; i <= live.length - 3; i++) live[i].remove();
  const s = scene.getBoundingClientRect(), c = cell.getBoundingClientRect();
  const fw = document.createElement('div');
  fw.className = `pixel-firework ${tierClass}`;
  fw.style.left = `${Math.round(c.left + c.width / 2 - s.left)}px`;
  fw.style.top = `${Math.round(c.top + c.height / 2 - s.top)}px`;
  const palette = { rarity: color, white: '#ffffff', gold: '#ffd700' };
  const snap = v => Math.round(v / 2) * 2;
  let html = '';
  for (const [count, radius, delay, colorKey] of rings) {
    const phase = delay ? Math.PI / count : 0;
    for (let k = 0; k < count; k++) {
      const a = phase + (k / count) * Math.PI * 2;
      html += `<i class="pf-spark" style="--dx:${snap(Math.cos(a) * radius)}px;--dy:${snap(Math.sin(a) * radius)}px;--pf-delay:${delay}ms;background:${palette[colorKey]}"></i>`;
    }
  }
  fw.innerHTML = html;
  scene.appendChild(fw);
  setTimeout(() => fw.remove(), 900);
}

const SFX = {
  roll:          { src: 'assets/sounds/roll.mp3',          gain: 0.55, cooldownMs: 45 },
  fish:          { src: 'assets/sounds/fish.mp3',          gain: 0.16, cooldownMs: 250, maxMs: 420, priority: 1 },
  coin:          { src: 'assets/sounds/coin.mp3',          gain: 0.38, cooldownMs: 80,  priority: 2 },
  inventoryFull: { src: 'assets/sounds/inventoryfull.mp3', gain: 0.2,  cooldownMs: 700, priority: 2 },
  bulkSale:      { src: 'assets/sounds/coins.mp3',         gain: 0.46, cooldownMs: 250, priority: 3 },
  potion:        { src: 'assets/sounds/potions.mp3',       gain: 0.28, cooldownMs: 400, priority: 3 },
  chest:         { src: 'assets/sounds/chest.mp3',         gain: 0.3,  cooldownMs: 300, priority: 3 },
  unlock:        { src: 'assets/sounds/unlock.mp3',        gain: 0.34, cooldownMs: 150, priority: 3 },
  achievement:   { src: 'assets/sounds/achievement.mp3',   gain: 0.32, cooldownMs: 2500, priority: 4 },
  catchBig:      { src: 'assets/sounds/reveal.mp3',        gain: 0.32, cooldownMs: 250, priority: 5, landingOffsetSec: 1.625 },
  catchBigLanded:{ src: null,                           gain: 0,    cooldownMs: 0,   priority: 5 },
  rebirth:       { src: 'assets/sounds/rebirth.mp3',       gain: 0.4,  cooldownMs: 3000, priority: 6 },
};
const sfxBuffers = {};
const sfxLastAt = {};
const sfxQueue = [];
let sfxFlushPending = false;
let sfxCtx = null;
const sfxDispatchLog = [];

// OfflineAudioContext decodes with no audible context — needs no user gesture and logs no autoplay warning.
function loadSfxBuffers() {
  const Offline = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!Offline || typeof window.fetch !== 'function') return;
  let decoder;
  try { decoder = new Offline(1, 1, 44100); } catch (e) { return; }
  new Set(Object.values(SFX).map(d => d.src).filter(Boolean)).forEach(src => {
    window.fetch(src).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(src))))
      .then(data => decoder.decodeAudioData(data))
      .then(buf => { sfxBuffers[src] = buf; })
      .catch(() => { });
  });
}

function getSfxContext() {
  if (sfxCtx) {
    if (sfxCtx.state === 'suspended') sfxCtx.resume().catch(() => {});
    return sfxCtx;
  }
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  const activation = typeof navigator !== 'undefined' && navigator.userActivation;
  if (activation && !activation.hasBeenActive) return null;
  try { sfxCtx = new Ctx(); } catch (e) { return null; }
  return sfxCtx;
}

function startSfx(key, offsetSec = 0) {
  const def = SFX[key];
  const buf = sfxBuffers[def.src];
  const ctx = getSfxContext();
  if (!ctx || !buf) return null;
  try {
    const t = ctx.currentTime;
    const level = def.gain * gameState.uiVolume;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    source.connect(gain).connect(ctx.destination);
    source.start(t, offsetSec);
    if (def.maxMs) {
      const end = t + def.maxMs / 1000;
      gain.gain.setValueAtTime(level, end - 0.08);
      gain.gain.linearRampToValueAtTime(0.0001, end);
      source.stop(end);
    }
    return source;
  } catch (e) { return null; }
}

function flushSfx() {
  sfxFlushPending = false;
  const batch = sfxQueue.splice(0);
  let best = null;
  for (const key of batch) if (!best || SFX[key].priority > SFX[best].priority) best = key;
  if (!best || !(gameState.uiVolume > 0)) return;
  sfxDispatchLog.push(best);
  if (sfxDispatchLog.length > 50) sfxDispatchLog.shift();
  startSfx(best, SFX[best].landingOffsetSec || 0);
}

const REVEAL_HIT_SEC = 1.675;
let revealCharge = { timeout: null, source: null, started: false };
function cancelRevealCharge() {
  clearTimeout(revealCharge.timeout);
  if (revealCharge.source) { try { revealCharge.source.stop(); } catch (e) { } }
  revealCharge = { timeout: null, source: null, started: false };
}
function scheduleRevealCharge(msUntilLanding) {
  cancelRevealCharge();
  if (!revealState.rolls.some(isPreRevealRoll)) return;
  const leadMs = REVEAL_HIT_SEC * 1000;
  if (msUntilLanding < leadMs) return;
  revealCharge.timeout = setTimeout(() => {
    revealCharge.timeout = null;
    if (!revealState.active || !(gameState.uiVolume > 0)) return;
    const source = startSfx('catchBig', 0);
    if (!source) return;
    revealCharge.source = source;
    revealCharge.started = true;
    sfxDispatchLog.push('catchBig:charge');
    if (sfxDispatchLog.length > 50) sfxDispatchLog.shift();
  }, msUntilLanding - leadMs);
}

function playSfx(key) {
  const def = SFX[key];
  if (!def || !(gameState.uiVolume > 0)) return;
  const now = performance.now();
  if (now - (sfxLastAt[key] ?? -Infinity) < def.cooldownMs) return;
  sfxLastAt[key] = now;
  sfxQueue.push(key);
  if (!sfxFlushPending) {
    sfxFlushPending = true;
    queueMicrotask(flushSfx);
  }
}

function playReelTick() {
  if (!(gameState.uiVolume > 0)) return;
  const now = performance.now();
  if (now - (sfxLastAt.roll ?? -Infinity) < SFX.roll.cooldownMs) return;
  sfxLastAt.roll = now;
  startSfx('roll');
}

const pixelSparkLastAt = {};
function pixelSparks(kind, options) {
  if (typeof confetti !== 'function' || prefersReducedMotion()) return;
  const now = Date.now();
  if (now - (pixelSparkLastAt[kind] || 0) < 300) return;
  pixelSparkLastAt[kind] = now;
  confetti({ shapes: ['square'], flat: true, scalar: 0.7, ticks: 110, gravity: 1.15, ...options });
}

function replayAnimationClass(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

function revealLandingTierClass(roll) {
  if (!roll || roll.kind === 'junk') return 'land-common';
  if (roll.kind === 'relic') return 'land-legendary';
  const name = roll.rarity && roll.rarity.name;
  if (name === 'Rare') return 'land-rare';
  if (name === 'Epic' || name === 'Heroic') return 'land-epic';
  if (name === 'Legendary' || name === 'Mythical' || name === 'Secret') return 'land-legendary';
  return 'land-common';
}

let milestoneBannerTimer = null;
function celebrateMilestone(title, detail, color = '#ffd700', variant = '', sparks = 36) {
  let banner = document.getElementById('milestone-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'milestone-banner';
    banner.setAttribute('role', 'status');
    document.body.appendChild(banner);
  }
  banner.className = variant;
  banner.style.setProperty('--mb-color', color);
  const bar = document.getElementById('stats-bar');
  const phone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 700px)').matches;
  const bannerTop = phone ? Math.round((window.innerHeight || 800) * 0.3)
    : Math.max(getNotificationTopOffset(), bar ? Math.round(bar.getBoundingClientRect().bottom) + 10 : 0);
  banner.style.top = `${bannerTop}px`;
  banner.innerHTML = `<div class="mb-title">${title}</div>${detail ? `<div class="mb-detail">${detail}</div>` : ''}`;
  replayAnimationClass(banner, 'mb-show');
  if (sparks) {
    const y = (bannerTop + 30) / Math.max(1, window.innerHeight || 1);
    pixelSparks(`milestone-${variant}`, { particleCount: sparks, spread: 80, startVelocity: 22, colors: [color, '#ffffff', '#ffd700'], origin: { x: 0.5, y } });
  }
  clearTimeout(milestoneBannerTimer);
  milestoneBannerTimer = setTimeout(() => { banner.remove(); milestoneBannerTimer = null; }, 2800);
}

function showRebirthMoment(rebirthNumber, pointsGained, bonusNow) {
  playSfx('rebirth');
  if (!prefersReducedMotion()) {
    let flash = document.getElementById('rebirth-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'rebirth-flash';
      document.body.appendChild(flash);
    }
    replayAnimationClass(flash, 'rebirth-flash-play');
    setTimeout(() => flash.remove(), 900);
  }
  celebrateMilestone(rebirthNumber === 1 ? 'First Rebirth!' : `Rebirth #${rebirthNumber}`,
    `+${pointsGained} Skill Points · Rebirth Bonus now +${Math.round(bonusNow * 100)}%`, '#e74c3c', 'mb-rebirth', 70);
}

function isSkillTreeComplete() {
  return skillTreeNodes.every(n => n.tier === 'cycle' || gameState.skillTreeUnlocked[n.id]);
}

function celebrateSkillNodePurchase(id, treeWasComplete) {
  playSfx('unlock');
  replayAnimationClass(document.querySelector(`#skilltree [data-node-id="${id}"]`), 'unlock-pop');
  if (!treeWasComplete && isSkillTreeComplete()) {
    celebrateMilestone('Skill tree complete!', 'Every permanent node is yours.', '#4fd1a5');
  }
}

const REVEAL_DECOY_BEFORE = 24;
const REVEAL_DECOY_AFTER = 5;
const REVEAL_EASE = 'power3.out';
const REVEAL_SKIP_MS = 280;

const CATCH_READ_PAUSE_MS = { manual: 2600, auto: 500 };

function getRevealDecoyPool() {
  const weights = getRarityWeights();
  return {
    junkChance: getJunkChance(),
    weights,
    total: weights.reduce((s, w) => s + w.chance, 0),
    location: gameState.currentLocation,
  };
}

let gsapWallClockSet = false;

function getRevealIcon(roll) {
  if (roll.kind === 'junk') return `assets/junk/${roll.junk.image}`;
  if (roll.kind === 'relic') return `assets/relics/${roll.shard.image}`;
  return getFishImage(roll.fish.id);
}

function getRevealColor(roll) {
  if (roll.kind === 'junk') return '#6b7590';
  return roll.rarity.color;
}


let tutorialScriptedCatchPending = false;

function triggerScriptedFirstCatch() {
  if (revealState.active) {
    tutorialScriptedCatchPending = true;
    return;
  }
  const bait = getCurrentBait();
  const allowedRarities = getAvailableRaritiesForTier(bait.tier);
  const rarity = fishRarities.find(r => allowedRarities.includes(r.name) && r.name !== 'Common' && !r.isSpecialRoll);
  if (!rarity) return;
  const pool = getFishPoolForLocation(gameState.currentLocation, rarity.name);
  const fish = pool[Math.floor(Math.random() * pool.length)];
  const weight = Math.round((fish.minWeight + Math.random() * (fish.maxWeight - fish.minWeight)) * 10) / 10;
  beginReveal([{ kind: 'fish', fish, rarity, isShiny: false, weight }], 'manual');
}

const TUTORIAL_MIN_FISH = 3;

const firstEnabled = selector => document.querySelector(`${selector}:not([disabled])`);
const TUTORIAL_STEPS = [
  { id: 'cast', tab: 'fishing' },
  { id: 'inventory', tab: 'inventory',
    go: "Your fish go here after you catch them. Let's take a look at your Inventory." },
  { id: 'sell', tab: 'inventory',
    go: 'Go back to your Inventory to sell a fish.',
    text: 'Fish are worth Coins. Sell a fish to turn your catch into money.',
    target: () => document.querySelector('#inventory-list .sell-coin-btn') },
  { id: 'index', tab: 'index',
    go: "The Index keeps track of the fish you've found. Let's check it.",
    text: "These are the fish you've discovered. Each one shows its rarity and where it lives. Keep fishing to fill it in.",
    next: true },
  { id: 'upgrade', tab: 'upgrade',
    go: "Use your Coins to make fishing better. Let's check your Upgrades.",
    text: () => (firstEnabled('#upgrade-list button')
      ? 'You can afford an upgrade! Buy it to make fishing better.'
      : 'Upgrades cost Coins. Keep selling fish, then come back to improve your gear.'),
    next: true },
  { id: 'locations', tab: 'locations',
    go: "Different waters have different fish. Let's look at Locations.",
    text: 'Pick where you fish here. New spots unlock as you level up and earn Coins.',
    next: true },
  { id: 'skilltree', tab: 'skilltree',
    go: "Anglers also grow through the Skill Tree. Let's open it.",
    text: 'Skill Tree upgrades are permanent. They cost Skill Points, which you earn by leveling up. Click the glowing node to buy your first one.',
    target: () => document.querySelector('.skilltree-node-pixel.renown-spotlight'), glow: false },
  { id: 'reveal', tab: 'fishing' },
  { id: 'potions', tab: 'potions',
    go: "Potions give you temporary boosts. Let's take a look.",
    text: () => (firstEnabled('#potions-list button')
      ? 'Potions give you a short boost. Use one when you want an extra push.'
      : 'Potions give you a short boost. Save up Coins and use one when you want an extra push.'),
    next: true },
  { id: 'crates', tab: 'crates',
    go: "Chests contain rewards. Let's see what you can find.",
    text: () => (firstEnabled('#crates-list .open-chest-btn')
      ? 'You have enough Pearls for a chest! Open one to see what is inside.'
      : 'Chests cost Pearls. You get Pearls from Awards and by selling fish for Pearls.'),
    next: true },
  { id: 'relics', tab: 'relics',
    go: "Relics give you lasting bonuses. Let's check yours.",
    text: "Relics give you bonuses that last. Rare catches and Deep Chests can hold them — they'll show up here.",
    next: true },
  { id: 'mastery', tab: 'mastery',
    go: "Awards track what you've accomplished. Let's take a look.",
    text: "Awards track what you've done and give Pearls. Keep playing and you'll unlock more.",
    next: true },
  { id: 'rebirth', tab: 'rebirth',
    go: 'One more thing: Rebirth.',
    text: 'Rebirth starts a new run and gives you permanent progression. It resets your current run, so make sure you are ready first.',
    next: true },
  { id: 'done', tab: null,
    text: "You're ready. Keep fishing, upgrade your gear, discover new fish, and see how far you can go.",
    next: true, nextLabel: "Let's fish!" },
];
const TUTORIAL_STEP_IDS = TUTORIAL_STEPS.map(s => s.id);

function getTutorialAllowedTabs(stepId) {
  const i = TUTORIAL_STEP_IDS.indexOf(stepId);
  const tabs = TUTORIAL_STEPS.slice(0, i + 1).map(s => s.tab).filter(Boolean);
  return [...new Set(['fishing', ...tabs])];
}
const TUTORIAL_ALLOWED_TABS = Object.fromEntries(TUTORIAL_STEP_IDS.map(id => [id, getTutorialAllowedTabs(id)]));

document.getElementById('tutorial-next-btn')?.addEventListener('click', () => advanceTutorial());

function isTutorialActive() {
  return !gameState.tutorialCompleted && !!gameState.tutorialStep;
}

function getTutorialStep() {
  return TUTORIAL_STEPS.find(s => s.id === gameState.tutorialStep) || null;
}

function startTutorialIfNeeded() {
  if (gameState.tutorialCompleted) return;
  if (!gameState.tutorialStep) {
    gameState.tutorialStep = 'cast';
    return;
  }
  if (gameState.tutorialStep === 'reveal') {
    gameState.tutorialStep = 'potions';
  } else if (!TUTORIAL_STEP_IDS.includes(gameState.tutorialStep)) {
    gameState.tutorialCompleted = true;
    gameState.tutorialStep = null;
  }
}

function isTutorialTabOpen(tab) {
  if (!tab) return true;
  const section = document.getElementById(tab);
  return !!section && section.classList.contains('active');
}

function advanceTutorial() {
  if (!isTutorialActive()) return;
  const i = TUTORIAL_STEP_IDS.indexOf(gameState.tutorialStep);
  const nextId = TUTORIAL_STEP_IDS[i + 1];
  if (!nextId) {
    gameState.tutorialCompleted = true;
    gameState.tutorialStep = null;
    updateTutorialBanner();
    saveState();
    switchToTab('fishing');
    return;
  }
  gameState.tutorialStep = nextId;
  if (nextId === 'skilltree') {
    gameState.rebirthPoints += 1;
    updateSkillTreeTab();
  }
  updateTutorialBanner();
  saveState();
}

function tutorialNotify(event) {
  if (!isTutorialActive()) return;
  const step = gameState.tutorialStep;
  if ((event === 'sell' && step === 'sell')
    || (event === 'upgrade' && step === 'upgrade')
    || (event === 'potion' && step === 'potions')
    || (event === 'chest' && step === 'crates')
    || (event === 'tab:inventory' && step === 'inventory')) {
    advanceTutorial();
  } else if (event.startsWith('tab:')) {
    updateTutorialBanner();
  }
}

function handleTutorialCatchResolved() {
  if (!isTutorialActive()) return;
  if (gameState.tutorialStep === 'cast') {
    if (getTotalInventoryCount() >= TUTORIAL_MIN_FISH) advanceTutorial();
    else updateTutorialBanner();
  } else if (gameState.tutorialStep === 'reveal') {
    if (tutorialScriptedCatchPending) {
      tutorialScriptedCatchPending = false;
      triggerScriptedFirstCatch();
      return;
    }
    advanceTutorial();
  }
}

function handleTutorialNodePurchased(id) {
  if (!isTutorialActive() || gameState.tutorialStep !== 'skilltree' || id !== 'start') return;
  gameState.tutorialStep = 'reveal';
  updateTutorialBanner();
  switchToTab('fishing');
  triggerScriptedFirstCatch();
}

function updateTutorialBanner() {
  const banner = document.getElementById('tutorial-banner');
  const text = document.getElementById('tutorial-banner-text');
  const nextBtn = document.getElementById('tutorial-next-btn');
  const settingsBtn = document.getElementById('settings-btn');
  if (!banner || !text) return;

  if (!isTutorialActive()) {
    banner.style.display = 'none';
    banner.classList.remove('tutorial-banner-top');
    if (settingsBtn) settingsBtn.style.display = '';
    if (nextBtn) nextBtn.hidden = true;
    refreshTutorialHighlight();
    return;
  }

  banner.style.display = 'block';
  if (settingsBtn) settingsBtn.style.display = 'none';

  const step = getTutorialStep();
  const open = step && isTutorialTabOpen(step.tab);
  let message = '';
  if (!step) {
    message = '';
  } else if (step.id === 'cast') {
    const have = getTotalInventoryCount();
    message = have === 0 && gameState.lifetimeFish === 0
      ? 'Welcome to Deepwater: Fishing Idle! Click "Fish!" below to cast your line.'
      : `Nice catch! Keep fishing until you have ${TUTORIAL_MIN_FISH} fish (${Math.min(have, TUTORIAL_MIN_FISH)}/${TUTORIAL_MIN_FISH}).`;
  } else if (step.id === 'reveal') {
    message = 'Watch what your new Luck finds...';
  } else {
    const body = open ? step.text : step.go;
    message = typeof body === 'function' ? body() : (body || '');
  }
  text.textContent = message;

  if (nextBtn) {
    const showNext = !!step && !!step.next && open;
    nextBtn.hidden = !showNext;
    nextBtn.textContent = step?.nextLabel || 'Got it';
  }
  refreshTutorialHighlight(true);
}

let tutorialHighlightRaf = null;
let tutorialHighlightKey = null;

function getTutorialTarget() {
  if (!isTutorialActive()) return null;
  const step = getTutorialStep();
  if (!step || step.id === 'reveal') return null;
  if (step.id === 'cast') return revealState.active ? null : { el: document.getElementById('fish-btn') };
  if (step.tab && !isTutorialTabOpen(step.tab)) {
    return { el: document.querySelector(`.tab-btn.rail-btn[data-tab="${step.tab}"]`), nav: true };
  }
  if (step.next) return { el: document.getElementById('tutorial-next-btn') };
  const el = step.target ? step.target() : null;
  return el ? { el, glow: step.glow !== false } : null;
}

function getTutorialArrow() {
  let arrow = document.getElementById('tutorial-arrow');
  if (!arrow) {
    arrow = document.createElement('div');
    arrow.id = 'tutorial-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.hidden = true;
    arrow.innerHTML = `<span class="tutorial-arrow-bob">${pxIcon('arrow-up')}</span>`;
    document.body.appendChild(arrow);
  }
  return arrow;
}

function tutorialHighlightFrame() {
  tutorialHighlightRaf = null;
  const t = getTutorialTarget();
  syncTutorialInputLock(t);
  const el = t && t.el && t.el.isConnected ? t.el : null;
  document.querySelectorAll('.tutorial-target').forEach(n => { if (n !== el || t.glow === false) n.classList.remove('tutorial-target'); });
  const arrow = getTutorialArrow();
  if (!el) {
    arrow.hidden = true;
    if (isTutorialActive()) tutorialHighlightRaf = requestAnimationFrame(tutorialHighlightFrame);
    return;
  }
  if (t.glow !== false) el.classList.add('tutorial-target');

  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) {
    arrow.hidden = true;
  } else {
    const size = 52, gap = 6;
    const rail = document.getElementById('icon-rail');
    const verticalRail = t.nav && rail && getComputedStyle(rail).flexDirection === 'column';
    const bannerEl = document.getElementById('tutorial-banner');
    let dir, x, y;
    if (bannerEl && bannerEl.contains(el)) { dir = 'right'; x = r.left - size - gap; y = r.top + r.height / 2 - size / 2; }
    else if (verticalRail) { dir = 'left'; x = r.right + gap; y = r.top + r.height / 2 - size / 2; }
    else if (r.top >= size + gap + 4) { dir = 'down'; x = r.left + r.width / 2 - size / 2; y = r.top - size - gap; }
    else { dir = 'up'; x = r.left + r.width / 2 - size / 2; y = r.bottom + gap; }
    x = Math.max(2, Math.min(window.innerWidth - size - 2, x));
    arrow.hidden = false;
    const banner = bannerEl;
    if (banner && banner.style.display !== 'none' && !banner.contains(el)) {
      const bb = banner.getBoundingClientRect();
      const top = Math.min(r.top, y), bottom = Math.max(r.bottom, y + size);
      if (bottom > bb.top && top < bb.bottom) banner.classList.toggle('tutorial-banner-top', (top + bottom) / 2 > window.innerHeight / 2);
    }
    arrow.dataset.dir = dir;
    arrow.style.left = `${Math.round(x)}px`;
    arrow.style.top = `${Math.round(y)}px`;
  }
  tutorialHighlightRaf = requestAnimationFrame(tutorialHighlightFrame);
}

function refreshTutorialHighlight(stepChanged = false) {
  if (stepChanged) {
    const t = getTutorialTarget();
    const key = t && t.el ? `${gameState.tutorialStep}|${t.nav ? 'nav' : 'panel'}` : null;
    if (key && key !== tutorialHighlightKey && t.el.isConnected) {
      if (typeof t.el.scrollIntoView === 'function') {
        if (t.nav) t.el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        else if (t.el.id !== 'tutorial-next-btn' && !t.el.closest('#skilltree')) t.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
      const overlay = getOpenOverlay();
      const inOpenOverlay = overlay && t.el.closest(OVERLAY_LAYER_SELECTOR[overlay] || '#none');
      const focusable = typeof t.el.focus === 'function' && !t.el.disabled && t.el.matches('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (focusable && (!overlay || inOpenOverlay) && document.activeElement !== t.el) t.el.focus({ preventScroll: true });
    }
    tutorialHighlightKey = key;
  }
  if (tutorialHighlightRaf === null) tutorialHighlightFrame();
}

const TUTORIAL_LOCK_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[tabindex="0"]',
].join(',');

const TUTORIAL_INVITED = {
  upgrade: '#upgrade-list',
  potions: '#potions-list',
  crates: '#crates-list',
  locations: '#location-picker',
};

const tutorialLockedEls = new Set();

function clearTutorialInputLock() {
  for (const el of tutorialLockedEls) el.removeAttribute('inert');
  tutorialLockedEls.clear();
}

function syncTutorialInputLock(t = getTutorialTarget()) {
  if (!isTutorialActive()) {
    if (tutorialLockedEls.size) clearTutorialInputLock();
    return;
  }
  const step = getTutorialStep();
  const targetEl = t && t.el && t.el.isConnected ? t.el : null;
  const allowedTabs = TUTORIAL_ALLOWED_TABS[gameState.tutorialStep] || [];
  const banner = document.getElementById('tutorial-banner');
  const overlay = getOpenOverlay();
  const overlayLayer = overlay && overlay !== 'skilltree'
    ? document.querySelector(OVERLAY_LAYER_SELECTOR[overlay] || '#nowhere')
    : null;
  const invited = step && TUTORIAL_INVITED[step.id]
    ? document.querySelector(TUTORIAL_INVITED[step.id])
    : null;

  const live = el => {
    if (banner && banner.contains(el)) return true;
    if (targetEl && (el === targetEl || el.contains(targetEl))) return true;
    if (overlayLayer && overlayLayer.contains(el)) return true;
    if (invited && invited.contains(el)) return true;
    return el.matches('.tab-btn[data-tab]') && allowedTabs.includes(el.dataset.tab);
  };

  const candidates = [...document.querySelectorAll(TUTORIAL_LOCK_SELECTOR)];
  const candidateSet = new Set(candidates);
  for (const el of [...tutorialLockedEls]) {
    if (candidateSet.has(el) && !live(el)) continue;
    el.removeAttribute('inert');
    tutorialLockedEls.delete(el);
  }
  for (const el of candidates) {
    if (tutorialLockedEls.has(el) || live(el)) continue;
    el.setAttribute('inert', '');
    tutorialLockedEls.add(el);
  }
}

function beginReveal(rolls, mode) {
  if (revealState.active) return;
  clearTimeout(revealState.readPauseTimeout);
  revealState.readPauseTimeout = null;
  clearTimeout(revealState.uiRemovalTimeout);
  revealState.uiRemovalTimeout = null;
  clearTimeout(revealState.preRevealTimeout);
  revealState.preRevealTimeout = null;
  document.querySelectorAll('#fishing .reveal-fx').forEach(el => el.remove());

  revealState.active = true;
  revealState.rolls = rolls;
  revealState.mode = mode;

  const duration = mode === 'manual' ? getRevealDurationMs(rolls) : getAutoFishRevealDurationMs(rolls);
  fishReadyAt = Date.now() + duration + (CATCH_READ_PAUSE_MS[mode] ?? 2600);
  if (elements.fishBtn) elements.fishBtn.disabled = true;
  try {
    drawReveal(duration);
  } finally {
    revealState.settleTimeout = setTimeout(() => finalizeReveal(), duration);
  }
  schedulePreReveal(duration);
  scheduleRevealCharge(duration);
}

function buildDecoyCellHtml(dist) {
  if (Math.random() < dist.junkChance) {
    const junk = junkCatalogue[Math.floor(Math.random() * junkCatalogue.length)];
    return `<div class="reveal-cell" style="--rarity:${getRevealColor({ kind: 'junk' })}"><img src="assets/junk/${junk.image}" alt=""></div>`;
  }
  let rand = Math.random() * dist.total;
  let rarity = dist.weights[0].rarity;
  for (const w of dist.weights) { rand -= w.chance; if (rand <= 0) { rarity = w.rarity; break; } }
  if (rarity.isSpecialRoll) {
    return `<div class="reveal-cell reveal-cell-mystery reveal-cell-relic" style="--rarity:${rarity.color}"><img src="${PRE_REVEAL_IMAGE}" alt=""></div>`;
  }
  if (PRE_REVEAL_RARITIES.includes(rarity.name)) {
    return `<div class="reveal-cell reveal-cell-mystery" style="--rarity:${rarity.color}"><img src="${PRE_REVEAL_IMAGE}" alt=""></div>`;
  }
  const pool = getFishPoolForLocation(dist.location, rarity.name);
  const fish = pool[Math.floor(Math.random() * pool.length)];
  return `<div class="reveal-cell" style="--rarity:${rarity.color}"><img src="${getFishImage(fish.id)}" alt=""></div>`;
}

function buildRealCellHtml(roll, index) {
  const color = getRevealColor(roll);
  if (isPreRevealRoll(roll)) {
    const relic = roll.kind === 'relic' ? ' reveal-cell-relic' : '';
    return `<div class="reveal-cell reveal-cell-real reveal-cell-mystery${relic}" id="reveal-real-${index}" data-color="${color}" data-reveal-src="${getRevealIcon(roll)}" style="--rarity:${color}"><img src="${PRE_REVEAL_IMAGE}" alt=""></div>`;
  }
  return `<div class="reveal-cell reveal-cell-real" id="reveal-real-${index}" data-color="${color}" style="--rarity:${color}"><img src="${getRevealIcon(roll)}" alt=""></div>`;
}

function drawReveal(duration) {
  let revealUI = document.getElementById('fishing-reveal');
  if (!revealUI) {
    revealUI = document.createElement('div');
    revealUI.id = 'fishing-reveal';
    document.getElementById('fishing-scene').appendChild(revealUI);
  }
  revealUI.className = revealState.rolls.length > 1 ? 'reveal-slots reveal-slots-multi' : 'reveal-slots';
  revealUI.onclick = null;

  revealUI.innerHTML = revealState.rolls.map((_, i) => `
    <div class="reveal-window">
      <div class="reveal-pointer" aria-hidden="true"></div>
      <div class="reveal-strip" id="reveal-strip-${i}"></div>
    </div>
  `).join('');

  const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof gsap !== 'undefined';
  // GSAP's lag smoothing treats a background tab's throttled rAF as lag and resumes the frozen tween seconds behind the settle timer.
  if (hasGsap && !gsapWallClockSet && gsap.ticker && typeof gsap.ticker.lagSmoothing === 'function') {
    gsap.ticker.lagSmoothing(0);
    gsapWallClockSet = true;
  }

  const decoyDist = getRevealDecoyPool();
  revealState.rolls.forEach((roll, i) => {
    const strip = document.getElementById(`reveal-strip-${i}`);
    const cells = [];
    for (let c = 0; c < REVEAL_DECOY_BEFORE; c++) cells.push(buildDecoyCellHtml(decoyDist));
    cells.push(buildRealCellHtml(roll, i));
    for (let c = 0; c < REVEAL_DECOY_AFTER; c++) cells.push(buildDecoyCellHtml(decoyDist));
    strip.innerHTML = cells.join('');

    const windowEl = strip.parentElement;
    const realCell = document.getElementById(`reveal-real-${i}`);
    // clientWidth, not offsetWidth: the strip moves inside the window's 3px border, so offsetWidth/2 parks every landed cell 3px right of the pointer.
    const finalX = realCell.offsetLeft + realCell.offsetWidth / 2 - windowEl.clientWidth / 2;
    strip.dataset.finalX = String(finalX);

    if (reducedMotion || !hasGsap) {
      strip.style.transform = `translateX(-${finalX}px)`;
    } else {
      gsap.set(strip, { x: 0 });
      const tickVars = i === 0 && revealState.mode === 'manual' ? reelTickVars(strip, windowEl) : {};
      gsap.to(strip, { x: -finalX, duration: duration / 1000, ease: REVEAL_EASE, ...tickVars });
    }
  });
}

function reelTickVars(strip, windowEl) {
  const cells = strip.children;
  if (cells.length < 2) return {};
  const first = cells[0].offsetLeft, pitch = cells[1].offsetLeft - cells[0].offsetLeft;
  if (!(pitch > 0)) return {};
  const center = windowEl.offsetWidth / 2;
  let lastIndex = null;
  return {
    onUpdate() {
      if (!revealState.active || !strip.isConnected) return;
      const x = Number(gsap.getProperty(strip, 'x')) || 0;
      const index = Math.floor((center - x - first) / pitch);
      if (lastIndex !== null && index !== lastIndex) playReelTick();
      lastIndex = index;
    },
  };
}

function skipReveal() {
  if (!revealState.active) return;
  clearTimeout(revealState.settleTimeout);

  try {
    document.querySelectorAll('#fishing-reveal .reveal-strip').forEach(strip => {
      const finalX = strip.dataset.finalX;
      if (finalX === undefined) return;
      if (typeof gsap !== 'undefined') {
        gsap.to(strip, { x: -Number(finalX), duration: REVEAL_SKIP_MS / 1000, ease: 'power2.out', overwrite: true });
      } else {
        strip.style.transform = `translateX(-${finalX}px)`;
      }
    });
  } finally {
    revealState.settleTimeout = setTimeout(() => finalizeReveal(), REVEAL_SKIP_MS);
  }
  schedulePreReveal(REVEAL_SKIP_MS);
  cancelRevealCharge();
}

function snapRevealStripsToLanding() {
  document.querySelectorAll('#fishing-reveal .reveal-strip').forEach(strip => {
    const finalX = strip.dataset.finalX;
    if (finalX === undefined) return;
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(strip);
      gsap.set(strip, { x: -Number(finalX) });
    } else {
      strip.style.transform = `translateX(-${finalX}px)`;
    }
  });
}

function finalizeReveal() {
  if (!revealState.active) return;
  revealState.active = false;
  clearTimeout(revealState.settleTimeout);
  revealState.settleTimeout = null;

  if (elements.fishBtn) elements.fishBtn.disabled = true;
  elements.fishingStatus.classList.remove('casting-text');

  clearTimeout(revealState.preRevealTimeout);
  revealState.preRevealTimeout = null;

  const revealUI = document.getElementById('fishing-reveal');
  if (revealUI) {
    revealUI.onclick = null;
    snapRevealStripsToLanding();
    let bigLanding = false;
    revealState.rolls.forEach((roll, i) => {
      const realCell = document.getElementById(`reveal-real-${i}`);
      if (realCell) {
        const color = realCell.dataset.color;
        if (color) { realCell.style.borderColor = color; realCell.style.color = color; realCell.style.setProperty('--rarity', color); }
        if (realCell.dataset.revealSrc) {
          const img = realCell.querySelector('img');
          if (img) img.src = realCell.dataset.revealSrc;
          realCell.classList.remove('reveal-cell-mystery');
        }
        const tierClass = revealLandingTierClass(roll);
        realCell.classList.add('reveal-landed', tierClass);
        if (isPreRevealRoll(roll)) {
          bigLanding = true;
          playRevealGif('bigHit', realCell, BIG_HIT_SIZE, i);
        } else {
          launchPixelFirework(realCell, tierClass, color);
        }
      }
    });
    if (bigLanding) shakeFishingScreen();
    revealState.uiRemovalTimeout = setTimeout(() => revealUI.remove(), CATCH_READ_PAUSE_MS[revealState.mode] ?? 900);
  }

  finishReveal();
}

function getJunkChance() {
  return Math.max(JUNK_CHANCE * (1 - getSkillEffectSum('junkAvoidPercent')), JUNK_CHANCE * 0.2);
}

function getRarityWeights() {
  const bait = getCurrentBait();
  const allowedRarities = getAvailableRaritiesForTier(bait.tier);
  const luck = getTotalLuck();
  const relicFindMultiplier = 1 + getSkillEffectSum('relicFindRatePercent');

  return fishRarities
    .filter(r => allowedRarities.includes(r.name))
    .map(r => {
      let chance = r.name === 'Common'
        ? r.chance / (1 + luck)
        : r.chance * (1 + luck * (r.luckCoefficient ?? 0));
      if (r.isSpecialRoll) chance *= relicFindMultiplier;
      return { rarity: r, chance: Math.max(chance, 0.00001) };
    });
}

function rollCatch() {
  if (Math.random() < getJunkChance()) {
    const junk = junkCatalogue[Math.floor(Math.random() * junkCatalogue.length)];
    return { kind: 'junk', junk };
  }

  const weighted = getRarityWeights();
  const total = weighted.reduce((s, w) => s + w.chance, 0);
  let rand = Math.random() * total;
  let picked = weighted[0].rarity;
  for (const w of weighted) { rand -= w.chance; if (rand <= 0) { picked = w.rarity; break; } }

  if (picked.isSpecialRoll) {
    const uncollected = relicShards.filter(s => !gameState.collectedShards[s.id]);
    const pool = uncollected.length > 0 ? uncollected : relicShards;
    const shard = pool[Math.floor(Math.random() * pool.length)];
    return { kind: 'relic', shard, rarity: picked };
  }

  const pool = getFishPoolForLocation(gameState.currentLocation, picked.name);
  const fish = pool[Math.floor(Math.random() * pool.length)];

  const isShiny = Math.random() < getSkillEffectSum('earlyShinyChance');

  const weight = rollFishWeight(fish);

  return { kind: 'fish', fish, rarity: picked, isShiny, weight };
}

function rollFishWeight(fish) {
  const bias = Math.min(getSkillEffectSum('weightRangeBias'), 0.9);
  const t = Math.pow(Math.random(), 1 / (1 + bias));
  return Math.round((fish.minWeight + t * (fish.maxWeight - fish.minWeight)) * 10) / 10;
}

const REBIRTH_POINTS_PER_LEVEL = 1;

function levelUpIfReady() {
  let leveled = false;
  while (gameState.xp >= getXpToNextLevel(gameState.level)) {
    gameState.xp -= getXpToNextLevel(gameState.level);
    gameState.level++;
    gameState.rebirthPoints += REBIRTH_POINTS_PER_LEVEL;
    leveled = true;
  }
  return leveled;
}

function rebirthPointsText(n) {
  return `+${n} Skill Point${n === 1 ? '' : 's'}`;
}

const FIRST_LEVEL_UP_TOAST_MS = 8000;
function announceLevelUp(levelBefore) {
  const points = rebirthPointsText((gameState.level - levelBefore) * REBIRTH_POINTS_PER_LEVEL);
  const line = `${pxIcon('star')} Level up! Now level ${gameState.level} · ${points}`;
  if (levelBefore < 2) {
    showNotification(`${line}. Every level up earns Skill Points - spend them in the Skill Tree now, no Rebirth needed.`, 'achievement', FIRST_LEVEL_UP_TOAST_MS);
    celebrateMilestone(`Level ${gameState.level}!`, `${points} for the Skill Tree`, '#ffd700', '', 0);
  } else {
    showNotification(line, 'achievement');
  }
  pixelSparks('levelup', { particleCount: 30, spread: 50, startVelocity: 25, colors: ['#ffd700', '#4fd1a5'], origin: { y: 0.4 } });
}

function recordDiscovery(fishId, isShiny, count, weight) {
  const key = isShiny ? `${fishId}|shiny` : fishId;
  const isNewDiscovery = !gameState.fishIndex[key];
  if (!gameState.fishIndex[key]) {
    gameState.fishIndex[key] = { fishId, isShiny, count: 0, minWeight: null, maxWeight: null };
  }
  const idx = gameState.fishIndex[key];
  idx.count = Math.min(idx.count + count, 9999);
  if (weight !== undefined) {
    if (idx.minWeight === null || weight < idx.minWeight) idx.minWeight = weight;
    if (idx.maxWeight === null || weight > idx.maxWeight) idx.maxWeight = weight;
  }
  return isNewDiscovery;
}

function addFishToInventory(fishId, isShiny, count, weight) {
  const key = isShiny ? `${fishId}|shiny` : fishId;
  if (!gameState.inventory[key]) {
    gameState.inventory[key] = { fishId, isShiny, count: 0 };
  }
  gameState.inventory[key].count = Math.min(gameState.inventory[key].count + count, 50);
  return recordDiscovery(fishId, isShiny, count, weight);
}

function getSellValue(rarity, isShiny, count = 1) {
  const mult = isShiny ? SHINY_SELL_MULTIPLIER : 1;
  return {
    coins: (rarity.baseCurrency || 0) * mult * count,
    pearls: (rarity.pearlValue || 0) * mult * count
  };
}

let lastCatchResolvedAt = 0;

function grantCatch(roll, { multiplier = 1, allowStreak = false, silent = false } = {}) {
  const summary = { isRelic: false, isJunk: false, isBagFull: false, isNewDiscovery: false, coins: 0, xp: 0, pearls: 0, leveled: false };

  if (getCappedInventoryCount() >= getInventoryCap()) {
    summary.isBagFull = true;
    return summary;
  }

  lastCatchResolvedAt = Date.now();

  const location = getCurrentLocation();

  if (roll.kind === 'junk') {
    summary.isJunk = true;
    summary.junk = roll.junk;
    gameState.junkCaught++;
    const isNewJunk = !gameState.junkIndex[roll.junk.id];
    if (isNewJunk) {
      gameState.junkIndex[roll.junk.id] = true;
      summary.isNewJunkDiscovery = true;
    }
    checkAchievements();
    return summary;
  }

  if (roll.kind === 'relic') {
    summary.isRelic = true;
    const alreadyOwned = !!gameState.collectedShards[roll.shard.id];
    if (!alreadyOwned) {
      gameState.collectedShards[roll.shard.id] = roll.shard;
      summary.shard = roll.shard;
      if (!silent) {
        showNotification(`${pxIcon('star')} ${roll.shard.name} recovered! The Tideheart grows stronger.`, 'discovery');
      }
    }
    checkAchievements();
    return summary;
  }

  const { fish, rarity, isShiny, weight } = roll;
  gameState.lifetimeFish++;

  if (gameState.chumBoost && gameState.chumBoost.remaining > 0) {
    gameState.chumBoost.remaining--;
    if (gameState.chumBoost.remaining <= 0) gameState.chumBoost = null;
  }

  const streakMultiplier = allowStreak ? getStreakMultiplier() : 1;

  const shinyMult = isShiny ? SHINY_SELL_MULTIPLIER : 1;
  const skillIncomeMultiplier = 1 + getSkillEffectSum('coinIncomePercent') + getRebirthBonus();
  let coins = Math.floor(rarity.baseCurrency * streakMultiplier * multiplier * location.incomeMultiplier * shinyMult * getRenownMultiplier() * skillIncomeMultiplier);
  let xp = Math.floor(rarity.xp * streakMultiplier * multiplier);

  gameState.coins += coins;
  gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + coins;
  gameState.xp += xp;
  summary.levelBefore = gameState.level;
  summary.leveled = levelUpIfReady();

  const autoSellIdx = gameState.autoSellRarity === 'none' ? -1 : rarityIndex(gameState.autoSellRarity);
  let shouldAutoSell = hasSkillEffect('unlockAutoSell') && autoSellIdx >= 0 && rarityIndex(rarity.name) <= autoSellIdx;

  if (!shouldAutoSell && hasSkillEffect('unlockAutoSellWeight') && gameState.autoSellMaxWeight !== null && weight <= gameState.autoSellMaxWeight) {
    shouldAutoSell = true;
  }

  if (!shouldAutoSell && hasSkillEffect('unlockCapacityRelief')) {
    const reliefThreshold = Math.max(0.9 - getSkillEffectSum('capacityReliefThresholdPercent'), 0.5);
    if (getCappedInventoryCount() >= getInventoryCap() * reliefThreshold) shouldAutoSell = true;
  }

  if (!shouldAutoSell) {
    const stackKey = isShiny ? `${fish.id}|shiny` : fish.id;
    const stack = gameState.inventory[stackKey];
    if (stack && stack.count >= 50) shouldAutoSell = true;
  }

  if (shouldAutoSell) {
    const sellValue = getSellValue(rarity, isShiny, 1);
    gameState.coins += sellValue.coins;
    gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + sellValue.coins;
    summary.autoSold = true;
    summary.isNewDiscovery = recordDiscovery(fish.id, isShiny, 1, weight);
  } else {
    summary.isNewDiscovery = addFishToInventory(fish.id, isShiny, 1, weight);
  }

  summary.coins = coins;
  summary.xp = xp;
  summary.fish = fish;
  summary.rarity = rarity;
  summary.isShiny = isShiny;
  summary.weight = weight;
  summary.streakMultiplier = streakMultiplier;

  const rarityAchievements = ['Rare', 'Epic', 'Heroic', 'Legendary', 'Mythical', 'Secret'];
  if (rarityAchievements.includes(rarity.name)) {
    unlockAchievement('catch', `${rarity.name.toLowerCase()}Catch`);
  }
  if (weight > gameState.heaviestCatch) gameState.heaviestCatch = weight;

  if (!silent && summary.isNewDiscovery) {
    showNotification(`${pxIcon('fish')} New discovery! <strong>${fish.name}</strong> added to your collection.`, 'discovery');
  }
  if (!silent && summary.leveled) announceLevelUp(summary.levelBefore);


  checkAchievements();
  return summary;
}

const BAG_FULL_STATUS_HTML = '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Bag full! Sell fish in Inventory to keep casting.';

let fishBtnFocusToRestore = false;

function startFishing() {
  if (isFishing || revealState.active) return;
  if (elements.fishBtn && elements.fishBtn.disabled) return;

  if (getCappedInventoryCount() >= getInventoryCap()) {
    elements.fishingStatus.innerHTML = BAG_FULL_STATUS_HTML;
    playSfx('inventoryFull');
    return;
  }

  fishBtnFocusToRestore = document.activeElement === elements.fishBtn;

  playSfx('fish');
  registerManualCast();

  isFishing = true;
  elements.fishingStatus.textContent = 'Casting...';
  elements.fishingStatus.classList.add('casting-text');
  gameState.timesFished++;

  const rolls = Array.from({ length: getRollCount() }, () => rollCatch());
  beginReveal(rolls, 'manual');
}

function finishReveal() {
  const mode = revealState.mode;
  const rolls = revealState.rolls;
  const multiplier = mode === 'manual' ? 1 : 0.75;
  const allowStreak = mode === 'manual';

  fishReadyAt = Date.now() + (CATCH_READ_PAUSE_MS[mode] ?? 2600);
  revealState.readPauseTimeout = setTimeout(() => {
    if (getCappedInventoryCount() >= getInventoryCap()) elements.fishingStatus.innerHTML = BAG_FULL_STATUS_HTML;
    else elements.fishingStatus.textContent = 'Ready to fish!';
    if (elements.fishBtn) elements.fishBtn.disabled = false;
    if (fishBtnFocusToRestore && elements.fishBtn && (!document.activeElement || document.activeElement === document.body)) {
      elements.fishBtn.focus({ preventScroll: true });
    }
    fishBtnFocusToRestore = false;
    hideFishWaitHint();
    isFishing = false;
    runPendingAutoFishCast();
  }, CATCH_READ_PAUSE_MS[mode] ?? 2600);

  const summaries = rolls.map(roll => grantCatch(roll, { multiplier, allowStreak }));
  const resolvedIdx = summaries.map((s, i) => (s.isBagFull ? -1 : i)).filter(i => i >= 0);
  const charged = revealCharge.started;
  clearTimeout(revealCharge.timeout);
  revealCharge = { timeout: null, source: null, started: false };
  if (resolvedIdx.length) {
    const big = resolvedIdx.some(i => isPreRevealRoll(rolls[i]));
    playSfx(big ? (charged ? 'catchBigLanded' : 'catchBig') : 'coin');
  }

  saveState();
  updateAllUI();
  renderCatchStatus(summaries, rolls, mode);
  if (summaries.some(s => s.coins > 0)) replayAnimationClass(elements.coins && elements.coins.closest('.stat-chip'), 'hud-bump');
  if (summaries.some(s => s.leveled)) replayAnimationClass(elements.xpLevel && elements.xpLevel.closest('.stat-chip'), 'hud-levelup');
  if (mode === 'manual') handleTutorialCatchResolved();
}

function renderCatchStatus(summaries, rolls, mode) {
  elements.fishingStatus.innerHTML = summaries.map((s, i) => renderSingleCatchLine(s, rolls[i], mode)).join('<hr>');
}

function renderSingleCatchLine(summary, roll, mode) {
  const prefix = mode === 'auto' ? 'Auto-caught' : 'Caught';

  if (summary.isBagFull) {
    const wouldHaveBeen = roll.kind === 'junk' ? roll.junk.name : roll.kind === 'relic' ? `the ${roll.shard.name}` : roll.fish.name;
    return `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Bag full: would have been <span class="catch-muted">${wouldHaveBeen}</span>, but there's nowhere to put it.`;
  }

  if (summary.isJunk) {
    addRecentCatchEntry(summary.junk.name, '#6b7590');
    return mode === 'auto'
      ? `<i class="fa-solid fa-trash" aria-hidden="true"></i> Auto-caught <span class="catch-muted">${summary.junk.name}</span>. Not quite a fish.`
      : `<i class="fa-solid fa-trash" aria-hidden="true"></i> Just <span class="catch-muted">${summary.junk.name}</span>. ${summary.junk.description}`;
  }

  if (summary.isRelic) {
    addRecentCatchEntry(`<i class="fa-solid fa-star" aria-hidden="true"></i> ${roll.shard.name}`, '#ffcc00');
    return mode === 'auto'
      ? `<i class="fa-solid fa-star" aria-hidden="true"></i> Auto-caught the <span style="color:#ffcc00;">${roll.shard.name}</span>!`
      : `<i class="fa-solid fa-star" aria-hidden="true"></i> You recovered the <span style="color:#ffcc00;">${roll.shard.name}</span>, a Tideheart relic!`;
  }

  addRecentCatchEntry(`${summary.isShiny ? '<i class="fa-solid fa-star" aria-hidden="true"></i> ' : ''}${summary.fish.name}${summary.isNewDiscovery ? ' <span class="new-badge">NEW</span>' : ''}`, summary.rarity.color);

  if (mode === 'auto') {
    return `
      ${prefix} <span style="color:${summary.rarity.color}">${summary.isShiny ? '<i class="fa-solid fa-star" aria-hidden="true"></i> ' : ''}${summary.fish.name}</span>!
      <br><span style="color:#ffd700; font-size:0.8em;">+${summary.coins} <img src="assets/icons/currency/coin.png" alt="" class="currency-icon"> &nbsp; +${summary.xp} <span style="color:#7de2fc;">XP</span> <span title="Auto Fish earns 75% of a manual catch">(Auto: 75%)</span></span>
    `;
  }

  const bonusLines = [];
  if (summary.streakMultiplier > 1) bonusLines.push(`<i class="fa-solid fa-fire" aria-hidden="true"></i> ${summary.streakMultiplier.toFixed(1)}x Streak`);
  if (summary.autoSold) bonusLines.push(`<i class="fa-solid fa-coins" aria-hidden="true"></i> Auto-sold`);

  const tier = revealLandingTierClass(roll);
  showFloatingReward(`+${summary.coins}`, tier === 'land-epic' || tier === 'land-legendary' ? summary.rarity.color : '#ffd700',
    tier === 'land-legendary' ? 'floating-reward-big' : '');
  return `
    ${prefix} <span style="color:${summary.rarity.color}">${summary.isShiny ? '<i class="fa-solid fa-star" aria-hidden="true"></i> ' : ''}${summary.fish.name}</span>!
    <span style="color:#b9c2de;font-size:0.8em;">(${formatWeight(summary.weight)})</span><br>
    <span style="font-size:0.9em; display:inline-flex; align-items:center; gap:6px; color:#ffd700;">
      +${summary.coins} <img src="assets/icons/currency/coin.png" alt="" class="currency-icon">
    </span><br>
    <span style="color:#7de2fc; font-size:0.9em;">+${summary.xp} XP</span>
    ${bonusLines.length ? `<br><span style="color:#4fd1a5; font-size:0.85em;">${bonusLines.join(' &nbsp; ')}</span>` : ''}
  `;
}

let autoFishInterval = null;
let autoFishTimer = 30;
let autoFishCountdown = null;
let autoFishCastPending = false;

function toggleAutoFish() {
  if (autoFishInterval) stopAutoFish();
  else startAutoFish();
}

function getAutoFishBurstSeconds() {
  return 30 + getSkillEffectSum('autoFishBurstSeconds');
}

function getAutoFishCadenceMs() {
  return Math.max(getCastTimeMs() - getSkillEffectSum('autoFishCooldownMs'), 1000);
}

function startAutoFish() {
  if (autoFishInterval) return;
  if (!gameState.autoFishUnlocked) return;
  autoFishTimer = getAutoFishBurstSeconds();
  updateAutoFishTimer();
  autoFishCastPending = false;

  autoFishInterval = setInterval(() => {
    if (!revealState.active && elements.fishBtn && !elements.fishBtn.disabled) autoCatchFish();
    else autoFishCastPending = true;
  }, getAutoFishCadenceMs());

  autoFishCountdown = setInterval(() => {
    autoFishTimer--;
    updateAutoFishTimer();
    if (autoFishTimer <= 0) stopAutoFish();
  }, 1000);

  if (elements.autoFishBtn) {
    elements.autoFishBtn.textContent = `Stop (${autoFishTimer}s)`;
    elements.autoFishBtn.style.background = '#8e44ad';
  }
}

function showFishWaitHint() {
  const hint = document.getElementById('fish-wait-hint');
  if (!hint) return;
  const seconds = Math.max(1, Math.ceil((fishReadyAt - Date.now()) / 1000));
  hint.textContent = `You are still fishing! Please wait ${seconds} second${seconds === 1 ? '' : 's'}!`;
  hint.hidden = false;
  clearTimeout(fishWaitHintTimeout);
  fishWaitHintTimeout = setTimeout(hideFishWaitHint, 1600);
}

function hideFishWaitHint() {
  clearTimeout(fishWaitHintTimeout);
  fishWaitHintTimeout = null;
  const hint = document.getElementById('fish-wait-hint');
  if (hint) hint.hidden = true;
}

function syncFishButtonAvailability() {
  if (!elements.fishBtn) return;
  const bagFull = getCappedInventoryCount() >= getInventoryCap();
  elements.fishBtn.classList.toggle('fish-btn-unavailable', bagFull);
  if (bagFull) elements.fishBtn.setAttribute('aria-disabled', 'true');
  else elements.fishBtn.removeAttribute('aria-disabled');
}

function autoCatchFish() {
  if (isFishing || revealState.active) return;

  if (getCappedInventoryCount() >= getInventoryCap()) {
    elements.fishingStatus.innerHTML = '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Bag full! Auto Fish is paused until you make room.';
    return;
  }

  if (elements.fishBtn) elements.fishBtn.disabled = true;
  gameState.timesFished++;

  const rolls = Array.from({ length: getRollCount() }, () => rollCatch());
  beginReveal(rolls, 'auto');
}

function runPendingAutoFishCast() {
  if (!autoFishCastPending) return;
  autoFishCastPending = false;
  if (autoFishInterval) autoCatchFish();
}

function stopAutoFish() {
  if (autoFishInterval) clearInterval(autoFishInterval);
  if (autoFishCountdown) clearInterval(autoFishCountdown);
  autoFishInterval = null;
  autoFishCountdown = null;
  autoFishCastPending = false;
  if (elements.autoFishBtn) {
    elements.autoFishBtn.textContent = 'Auto Fish';
    elements.autoFishBtn.style.background = '#8e44ad';
  }
}

function updateAutoFishTimer() {
  if (elements.autoFishBtn && autoFishInterval) {
    elements.autoFishBtn.textContent = `Stop (${autoFishTimer}s)`;
  }
}

const OFFLINE_MAX_MS = 12 * 60 * 60 * 1000;
const OFFLINE_MAX_CATCHES = 400;
const OFFLINE_REWARD_MULTIPLIER = 0.5;

function getOfflineIntervalMs() {
  const base = gameState.autoFishUnlocked ? 90000 : 300000;
  const rodReduction = gameState.reelSpeedLevel * 5000;
  const idleEfficiencyMult = Math.pow(IDLE_EFFICIENCY_INTERVAL_MULT, gameState.idleEfficiencyLevel);
  const skillMult = Math.max(1 - getSkillEffectSum('offlineIntervalPercent'), 0.5);
  return Math.max(Math.round((base - rodReduction) * idleEfficiencyMult * skillMult), 30000);
}

function getOfflineMaxCatches() {
  return OFFLINE_MAX_CATCHES + gameState.idleEfficiencyLevel * IDLE_EFFICIENCY_EXTRA_CATCHES;
}

function applyOfflineProgress({ elapsedMs = null, showSummary = true } = {}) {
  const now = Date.now();
  const last = gameState.lastSeen || now;
  let creditMs = elapsedMs === null ? now - last : elapsedMs;

  if (creditMs < 0) creditMs = 0;
  const wasAway = creditMs >= 60000;
  const awayTotal = creditMs;
  creditMs = Math.min(creditMs, OFFLINE_MAX_MS);
  gameState.lastSeen = now;

  if (!wasAway || gameState.lifetimeFish === 0) return null;

  const intervalMs = getOfflineIntervalMs();
  const maxCatches = getOfflineMaxCatches();
  const catchesByTime = Math.floor(creditMs / intervalMs);
  let catches = Math.min(catchesByTime, maxCatches);
  const summary = { away: creditMs, awayTotal, catches, fishCaught: 0, junkFound: 0, coins: 0, pearls: 0, rareCount: 0, discoveries: [],
    bagFilled: false, hitCatchCap: false, maxCatches, levelBefore: gameState.level };
  if (catches <= 0) return summary;

  for (let i = 0; i < catches; i++) {
    if (getCappedInventoryCount() >= getInventoryCap()) { summary.bagFilled = true; break; }
    const roll = rollCatch();
    const before = gameState.coins;
    const result = grantCatch(roll, { multiplier: OFFLINE_REWARD_MULTIPLIER, allowStreak: false, silent: true });
    if (result.isBagFull) { summary.bagFilled = true; break; }
    if (result.isJunk) { summary.junkFound++; continue; }
    if (result.isRelic) continue;
    summary.fishCaught++;
    summary.coins += gameState.coins - before;
    if (['Legendary', 'Mythical', 'Secret'].includes(result.rarity.name)) summary.rareCount++;
    if (result.isNewDiscovery) summary.discoveries.push(result.fish.name);
  }
  summary.hitCatchCap = catchesByTime > maxCatches && !summary.bagFilled;

  gameState.offlineCatchesLifetime += summary.fishCaught;

  if (creditMs >= 3600000) unlockAchievement('idle', 'welcomeBack');
  checkAchievements();
  saveState();

  if (showSummary && (summary.fishCaught > 0 || summary.junkFound > 0)) showOfflineModal(summary);
  return summary;
}

function formatAwayTime(ms) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function showOfflineModal(summary) {
  const awayTotal = Math.max(summary.awayTotal ?? summary.away, summary.away);
  const capped = awayTotal > summary.away;
  const subText = capped
    ? `You were away for ${formatAwayTime(awayTotal)}. The tide worked for you for the first ${formatAwayTime(summary.away)}.`
    : `You were away for ${formatAwayTime(summary.away)}. The tide didn’t stop working for you.`;

  const overlay = document.createElement('div');
  overlay.id = 'offline-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'offline-modal-title');
  overlay.setAttribute('tabindex', '-1');

  const discoveriesHtml = summary.discoveries.length
    ? `<div class="offline-modal-discoveries">New discoveries: ${summary.discoveries.slice(0, 5).join(', ')}${summary.discoveries.length > 5 ? '…' : ''}</div>`
    : '';
  const limitHtml = summary.bagFilled
    ? `<div class="offline-modal-limit">${pxIcon('bag')} Your bag filled up, so catching stopped early. Sell before you leave to keep catching while you're away.</div>`
    : summary.hitCatchCap
      ? `<div class="offline-modal-limit">${pxIcon('hourglass')} You reached the ${summary.maxCatches}-catch limit for one trip away. Idle Efficiency raises it.</div>`
      : '';

  overlay.innerHTML = `
    <div class="offline-modal-box">
      <h2 id="offline-modal-title">Welcome back!</h2>
      <div class="offline-modal-sub">${subText}</div>
      <div class="offline-modal-stats">
        <div>${pxIcon('fish')} Fish caught: <strong>${summary.fishCaught}</strong></div>
        <div>${pxIcon('coin')} Coins earned: <strong>${formatNumber(summary.coins)}</strong></div>
        <div>${pxIcon('star')} Rare+ catches: <strong>${summary.rareCount}</strong></div>
        ${summary.junkFound > 0 ? `<div>${pxIcon('trash')} Junk snagged: <strong>${summary.junkFound}</strong></div>` : ''}
        ${gameState.level > summary.levelBefore ? `<div>${pxIcon('arrow-up')} Level up! Now level <strong>${gameState.level}</strong>: ${rebirthPointsText((gameState.level - summary.levelBefore) * REBIRTH_POINTS_PER_LEVEL)} for the Skill Tree</div>` : ''}
      </div>
      ${discoveriesHtml}
      ${limitHtml}
      <button id="offline-modal-close" class="pixel-btn">Nice!</button>
    </div>
  `;

  document.body.appendChild(overlay);
  const closeModal = () => {
    overlay.remove();
    updateAllUI();
    document.querySelector('.tab-btn[data-tab="fishing"]')?.focus();
  };
  document.getElementById('offline-modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  overlay.focus();
}

let hiddenSince = document.hidden ? Date.now() : null;
let adoptGenerationAtHide = adoptGeneration;
let externalWriteGenerationAtHide = externalWriteGeneration;

function markTabHidden() {
  if (hiddenSince !== null) return;
  hiddenSince = Date.now();
  adoptGenerationAtHide = adoptGeneration;
  externalWriteGenerationAtHide = externalWriteGeneration;
}

function creditHiddenWindow() {
  const since = hiddenSince;
  const genAtHide = adoptGenerationAtHide;
  const extGenAtHide = externalWriteGenerationAtHide;
  hiddenSince = null;
  adoptGenerationAtHide = adoptGeneration;
  externalWriteGenerationAtHide = externalWriteGeneration;

  if (since === null) return null;

  let stored = null;
  try {
    stored = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    warnSaveFailure(e);
    return null;
  }

  const rev = storedRevision(stored);
  const adoptedWhileHidden = adoptGeneration !== genAtHide;
  const fastForwardedWhileHidden = externalWriteGeneration !== extGenAtHide;
  const externalAdvance = rev > knownSaveRevision || adoptedWhileHidden || fastForwardedWhileHidden;

  if (rev > knownSaveRevision) {
    const decision = classifyStaleStored(stored);
    if (decision.action === 'fastforward') {
      fastForwardPastContentFreeWrite(rev, decision.storedLastSeen);
    } else if (!adoptStoredSave(stored)) {
      return null;
    }
  }

  let credit = null;
  try {
    if (externalAdvance) {
      credit = applyOfflineProgress({ showSummary: false });
    } else {
      credit = applyOfflineProgress({
        elapsedMs: Date.now() - Math.max(since, lastCatchResolvedAt),
        showSummary: false
      });
    }
    if (credit && credit.catches > 0) updateAllUI();
  } catch (e) {
    console.error('Background offline progress failed to apply; the hidden window was settled without a retry.', e);
  } finally {
    if (!credit || credit.catches === 0) saveState();
  }
  return credit;
}

function handleVisibilityChange() {
  if (document.hidden) {
    markTabHidden();
    return null;
  }
  return creditHiddenWindow();
}

document.addEventListener('visibilitychange', handleVisibilityChange);

function isSectionActive(id) {
  const section = document.getElementById(id);
  return !!section && section.classList.contains('active');
}

function updateAllUI() {
  syncFishButtonAvailability();
  if (elements.coins) elements.coins.textContent = formatNumber(gameState.coins);
  if (elements.pearls) elements.pearls.textContent = formatNumber(gameState.pearls);
  if (elements.lifetimeFish) elements.lifetimeFish.textContent = formatNumber(gameState.lifetimeFish);

  if (elements.luck) elements.luck.textContent = (getTotalLuck() * 100).toFixed(1);
  if (elements.reelSpeed) elements.reelSpeed.textContent = ['I', 'II', 'III', 'IV'][gameState.reelSpeedLevel] || 'I';

  if (elements.xpLevel) elements.xpLevel.textContent = gameState.level;
  const xpNeeded = getXpToNextLevel(gameState.level);
  if (elements.xpProgress) elements.xpProgress.style.width = Math.min((gameState.xp / xpNeeded) * 100, 100) + '%';
  if (elements.xpText) elements.xpText.textContent =
    `${numberFormatterPlain.format(Math.floor(gameState.xp))} / ${numberFormatterPlain.format(xpNeeded)}`;

  updateFishingScene();
  updateUpgradesTab();
  if (isSectionActive('inventory')) updateInventoryTab();
  if (isSectionActive('index')) updateIndexTab();
  updateRelicsTab();
  if (isSectionActive('mastery')) updateAchievementsTab();
  updateChestsTab();
  updateAutoSellLockState();
  updateAutoSellWeightRow();
  if (isSectionActive('skilltree')) updateSkillTreeTab();
  updateRebirthTab();
  updateTutorialBanner();

  if (gameState.autoFishUnlocked && !elements.autoFishBtn) {
    const container = document.getElementById('fish-btn-container');
    if (container && !document.getElementById('auto-fish-btn')) {
      elements.autoFishBtn = document.createElement('button');
      elements.autoFishBtn.id = 'auto-fish-btn';
      elements.autoFishBtn.className = 'pixel-btn';
      elements.autoFishBtn.style.cssText = 'font-size: 1.2em; padding: 1em 2.5em; background: #8e44ad; color: #fff;';
      elements.autoFishBtn.textContent = 'Auto Fish';
      elements.autoFishBtn.addEventListener('click', toggleAutoFish);
      container.appendChild(elements.autoFishBtn);
    }
  }
}

function updateFishingScene() {
  const location = getCurrentLocation();
  const scene = document.getElementById('fishing-scene');
  if (scene) scene.style.background = location.gradient;

  const bagEl = document.getElementById('bag-capacity');
  if (bagEl) {
    const count = getCappedInventoryCount();
    const cap = getInventoryCap();
    const full = count >= cap;
    bagEl.textContent = full ? `Bag: ${count}/${cap} - full! Nothing more can be reeled in.` : `Bag: ${count}/${cap}`;
    bagEl.style.color = full ? '#ff6b6b' : count >= cap * 0.8 ? '#ffd700' : '#7a8399';
  }

  const locationLine = document.getElementById('current-location-line');
  if (locationLine) {
    const hadFocus = locationLine.contains(document.activeElement);
    const here = getCurrentLocation();
    const others = locations.length - 1;
    locationLine.innerHTML = `
      <span>${pxIcon('pin', { color: here.accent, size: '1.6em' })} Fishing at <strong style="color:${here.accent};">${here.name}</strong> <span style="color:${here.accent};">(x${here.incomeMultiplier.toFixed(2)} value)</span></span>
      ${others > 0 && !isTutorialActive() ? '<button type="button" class="pixel-btn current-location-change">Change</button>' : ''}
    `;
    const changeBtn = locationLine.querySelector('.current-location-change');
    changeBtn?.addEventListener('click', () => {
      document.querySelector('.tab-btn[data-tab="locations"]')?.click();
    });
    if (hadFocus) changeBtn?.focus();
  }

  const picker = document.getElementById('location-picker');
  if (!picker) return;

  let restoreIdx = -1;
  if (picker.contains(document.activeElement)) {
    let n = document.activeElement;
    while (n && n.parentElement !== picker) n = n.parentElement;
    if (n) restoreIdx = Array.prototype.indexOf.call(picker.children, n);
  }
  picker.innerHTML = '';

  locations.forEach(loc => {
    const unlocked = gameState.unlockedLocations.includes(loc.id);
    const meetsLevel = gameState.level >= loc.unlockLevel;
    const cost = getScaledCost(loc.unlockCost);
    const canAfford = gameState.coins >= cost;
    const isActive = gameState.currentLocation === loc.id;

    const card = document.createElement(unlocked ? 'button' : 'div');
    if (unlocked) card.type = 'button';
    card.style.cssText = `
      flex: 1 1 150px; min-width: 140px; max-width: 220px; padding: 0.7em 0.8em;
      border-radius: 8px; cursor: ${unlocked ? 'pointer' : 'default'};
      border: 2px solid ${isActive ? loc.accent : unlocked ? '#4a5570' : '#3a3f54'};
      background: ${isActive ? loc.accent + '22' : 'rgba(0,0,0,0.25)'};
      transition: border 0.2s, background 0.2s;
      ${unlocked ? 'font: inherit; box-sizing: content-box; letter-spacing: inherit; text-align: start; color: inherit; appearance: none;' : ''}
    `;
    if (unlocked && isActive) card.setAttribute('aria-current', 'true');

    if (unlocked) {
      card.innerHTML = `
        <div style="color:${isActive ? loc.accent : '#e0eaff'}; font-size:0.8em; font-weight:bold; margin-bottom:0.3em;">${isActive ? `${pxIcon('pin', { size: '1.6em' })} ` : ''}${loc.name}</div>
        <div style="color:#b9c2de; font-size:0.68em; line-height:1.4;">${loc.desc}</div>
        <div style="color:${loc.accent}; font-size:0.68em; margin-top:0.4em;">x${loc.incomeMultiplier.toFixed(2)} value</div>
      `;
      card.addEventListener('click', () => {
        gameState.currentLocation = loc.id;
        saveState();
        updateAllUI();
      });
    } else {
      const reqs = [];
      if (!meetsLevel) reqs.push(`Lv. ${loc.unlockLevel}`);
      if (cost > 0) reqs.push(`${formatNumber(cost)} coins`);
      card.innerHTML = `
        <div style="color:#6b7590; font-size:0.8em; font-weight:bold; margin-bottom:0.3em;">${pxIcon('lock')} ${loc.name}</div>
        <div style="color:#8a93ad; font-size:0.78em; line-height:1.5; margin-bottom:0.5em;">Requires ${reqs.join(' & ')}</div>
        <button class="pixel-btn" style="font-size:0.72em; padding:0.4em 0.7em; width:100%;" ${meetsLevel && canAfford ? '' : 'disabled'}>
          ${meetsLevel ? (canAfford ? 'Unlock' : 'Need coins') : 'Locked'}
        </button>
      `;
      const btn = card.querySelector('button');
      if (meetsLevel && canAfford) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          gameState.coins -= cost;
          gameState.totalSpent += cost;
          const firstEveryLocation = !gameState.achievements.location_explorer;
          gameState.unlockedLocations.push(loc.id);
          gameState.currentLocation = loc.id;
          showNotification(`${pxIcon('pin', { size: '1.6em' })} ${loc.name} unlocked!`, 'discovery');
          checkAchievements();
          saveState();
          updateAllUI();
          replayAnimationClass(document.getElementById('location-picker')?.children[locations.indexOf(loc)], 'unlock-pop');
          if (firstEveryLocation && gameState.achievements.location_explorer) {
            celebrateMilestone(`${loc.name} unlocked!`, 'Every fishing spot is now open to you.', loc.accent);
          }
        });
      }
    }

    picker.appendChild(card);
  });

  if (restoreIdx >= 0 && picker.children[restoreIdx]) picker.children[restoreIdx].focus();
}

function raritySortedEntries(map) {
  return Object.entries(map).sort((a, b) => {
    const fa = getFishById(a[1].fishId);
    const fb = getFishById(b[1].fishId);
    return rarityIndex(fb ? fb.rarity : 'Common') - rarityIndex(fa ? fa.rarity : 'Common');
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('/', '&#47;');
}

function updateInventoryTab() {
  const container = document.getElementById('inventory-list');
  if (!container) return;

  const capacityEl = document.getElementById('inventory-capacity');
  if (capacityEl) {
    const count = getCappedInventoryCount();
    const cap = getInventoryCap();
    capacityEl.textContent = `(${count}/${cap})`;
    capacityEl.style.color = count >= cap ? '#ff6b6b' : count >= cap * 0.8 ? '#ffd700' : '#7a8399';
  }

  const totalsEl = document.getElementById('inventory-sell-all');
  if (totalsEl) {
    let totalCoins = 0, totalPearls = 0;
    Object.values(gameState.inventory).forEach(item => {
      if (item.count <= 0 || item.pinned) return;
      const fish = getFishById(item.fishId);
      if (!fish) return;
      const rarity = fishRarities.find(r => r.name === fish.rarity);
      const value = getSellValue(rarity, item.isShiny, item.count);
      totalCoins += value.coins;
      totalPearls += value.pearls;
    });
    totalsEl.style.display = Object.keys(gameState.inventory).length ? 'flex' : 'none';
    totalsEl.innerHTML = `
      <button id="sell-all-coins-btn" class="pixel-btn" style="padding: 0.7em 1.2em; background: #4a90a4; color: #12151d; display: flex; align-items: center; gap: 0.3em; font-size: 0.8em;">
        <img src="assets/icons/currency/coin.png" alt="" class="currency-icon">Sell All (${formatNumber(totalCoins)})
      </button>
      <button id="sell-all-pearls-btn" class="pixel-btn" style="padding: 0.7em 1.2em; background: #8e44ad; color: #fff; display: flex; align-items: center; gap: 0.3em; font-size: 0.8em;">
        <img src="assets/icons/currency/pearl.png" alt="" class="currency-icon">Sell All (${formatNumber(totalPearls)})
      </button>
    `;
    document.getElementById('sell-all-coins-btn')?.addEventListener('click', () => sellAll('coins'));
    document.getElementById('sell-all-pearls-btn')?.addEventListener('click', () => sellAll('pearls'));
  }

  const searchTerm = (document.getElementById('fish-search')?.value || '').toLowerCase();
  const activeRarities = Array.from(document.querySelectorAll('.rarity-filter:checked')).map(cb => cb.dataset.rarity);
  const showShinyOnly = document.getElementById('shiny-filter')?.checked || false;

  const orderedEntries = hasSkillEffect('unlockAutoSort') ? raritySortedEntries(gameState.inventory) : Object.entries(gameState.inventory);
  const entries = orderedEntries.filter(([key, item]) => {
    if (item.count <= 0) return false;
    const fish = getFishById(item.fishId);
    if (!fish) return false;
    if (searchTerm && !fish.name.toLowerCase().includes(searchTerm)) return false;
    if (showShinyOnly && !item.isShiny) return false;
    if (activeRarities.length > 0 && !activeRarities.includes(fish.rarity)) return false;
    return true;
  });

  if (Object.keys(gameState.inventory).length === 0) {
    container.innerHTML = '<div class="empty-message">Nothing in your creel yet - go catch something!</div>';
    return;
  }

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-message">No matching fish found.</div>';
    return;
  }

  const pinEnabled = hasSkillEffect('unlockPin');
  container.innerHTML = '';
  entries.forEach(([key, item]) => {
    const fish = getFishById(item.fishId);
    if (!fish) return;
    const rarity = fishRarities.find(r => r.name === fish.rarity);
    const perFish = getSellValue(rarity, item.isShiny, 1);
    const shinyStack = gameState.inventory[`${item.fishId}|shiny`];
    const canCraftShiny = !item.isShiny && item.count >= 10 && !(shinyStack && shinyStack.count >= 50);

    const div = document.createElement('div');
    div.style.cssText = `
      background: rgba(0,0,0,0.3); padding: 1em; margin-bottom: 0.8em; border-radius: 8px;
      border: 2px solid ${rarity.color}; ${item.isShiny ? 'box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);' : ''}
      display: flex; justify-content: space-between; align-items: center; gap: 1em; flex-wrap: wrap;
    `;
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1em;">
        <img src="${getFishImage(fish.id)}" alt="" style="width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated;">
        <div>
          <div style="color: ${rarity.color}; font-weight: bold;">${item.pinned ? '<i class="fa-solid fa-thumbtack" aria-hidden="true"></i> ' : ''}${item.isShiny ? '<i class="fa-solid fa-star" aria-hidden="true"></i> ' : ''}${fish.name}</div>
          <div style="color: #b9c2de; font-size: 0.85em;">Count: ${item.count}/50${item.isShiny ? ' (5x value)' : ''}${item.pinned ? ' - pinned, protected from Sell All' : ''}</div>
        </div>
      </div>
      <div style="display: flex; gap: 0.5em; flex-wrap: wrap; align-items: center;">
        ${canCraftShiny ? `<button class="pixel-btn shiny-craft-btn" data-key="${escapeHtml(key)}" style="padding: 0.5em 1em; background: #8e44ad; color: #fff;">Make Shiny</button>` : ''}
        ${pinEnabled ? `<button class="pixel-btn pin-toggle-btn" data-key="${escapeHtml(key)}" title="${item.pinned ? 'Unpin' : 'Pin (protect from Sell All)'}" aria-pressed="${item.pinned}" style="padding: 0.5em 0.8em; background: ${item.pinned ? '#ffd700' : '#444'}; color: ${item.pinned ? '#12151d' : '#fff'};"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i></button>` : ''}
        <button class="pixel-btn sell-coin-btn" data-key="${escapeHtml(key)}" aria-label="Sell one for ${perFish.coins} coins" style="padding: 0.5em 1em; background: #4a90a4; color: #12151d; display: flex; align-items: center; gap: 0.3em;">
          <img src="assets/icons/currency/coin.png" alt="" class="currency-icon">${perFish.coins}
        </button>
        <button class="pixel-btn sell-pearls-btn" data-key="${escapeHtml(key)}" aria-label="Sell one for ${perFish.pearls} pearls" style="padding: 0.5em 1em; background: #8e44ad; color: #fff; display: flex; align-items: center; gap: 0.3em;">
          <img src="assets/icons/currency/pearl.png" alt="" class="currency-icon">${perFish.pearls}
        </button>
      </div>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll('.shiny-craft-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const item = gameState.inventory[key];
      if (!item || item.count < 10) return;

      const shinyKey = `${item.fishId}|shiny`;
      if (gameState.inventory[shinyKey] && gameState.inventory[shinyKey].count >= 50) return;

      item.count -= 10;
      if (item.count === 0) delete gameState.inventory[key];

      if (!gameState.inventory[shinyKey]) gameState.inventory[shinyKey] = { fishId: item.fishId, isShiny: true, count: 0 };
      gameState.inventory[shinyKey].count = Math.min(gameState.inventory[shinyKey].count + 1, 50);
      recordDiscovery(item.fishId, true, 1);

      showNotification(`${pxIcon('star')} Crafted a shiny ${getFishById(item.fishId).name}!`, 'discovery');
      checkAchievements();
      updateAllUI();
      saveState();
    });
  });
  document.querySelectorAll('.sell-coin-btn').forEach(btn => btn.addEventListener('click', () => sellFish(btn.dataset.key, false)));
  document.querySelectorAll('.sell-pearls-btn').forEach(btn => btn.addEventListener('click', () => sellFish(btn.dataset.key, true)));
  document.querySelectorAll('.pin-toggle-btn').forEach(btn => btn.addEventListener('click', () => togglePin(btn.dataset.key)));
}

function buildFilterBarHtml(idPrefix, activeRarities, showShinyOnly) {
  const rarityOptions = ['Common', 'Rare', 'Epic', 'Heroic', 'Legendary', 'Mythical', 'Secret'];
  return `
    <div class="inventory-search">
      <input type="text" id="${idPrefix}-search" placeholder="Search fish..." aria-label="Search fish">
      <button id="${idPrefix}-search-btn" class="pixel-btn">Search</button>
      <button id="${idPrefix}-reset-btn" class="pixel-btn">Reset</button>
    </div>
    <div class="inventory-filters">
      ${rarityOptions.map(r => `
        <label class="material-checkbox">
          <input type="checkbox" class="${idPrefix}-rarity-filter" data-rarity="${r}" ${activeRarities.includes(r) ? 'checked' : ''}>
          <span class="checkmark"></span><span>${r}</span>
        </label>
      `).join('')}
      <label class="material-checkbox">
        <input type="checkbox" id="${idPrefix}-shiny-filter" ${showShinyOnly ? 'checked' : ''}>
        <span class="checkmark"></span><span class="shiny-glow">Shiny</span>
      </label>
    </div>
  `;
}

function updateIndexTab() {
  const container = document.getElementById('index-list');
  if (!container) return;

  const searchTerm = document.getElementById('index-search')?.value || '';
  const activeRarities = Array.from(document.querySelectorAll('.index-rarity-filter:checked')).map(cb => cb.dataset.rarity);
  const showShinyOnly = document.getElementById('index-shiny-filter')?.checked || false;

  const discoveredCount = fishCatalogue.filter(f => gameState.fishIndex[f.id]).length;

  const rarityBreakdown = fishRarities
    .filter(r => !r.isSpecialRoll)
    .map(r => {
      const total = fishCatalogue.filter(f => f.rarity === r.name).length;
      const found = fishCatalogue.filter(f => f.rarity === r.name && gameState.fishIndex[f.id]).length;
      return `<span style="color:${r.color};">${r.name} ${found}/${total}</span>`;
    })
    .join(' <span style="color:#4a5570;">·</span> ');

  const rows = [];
  fishCatalogue.forEach(fish => {
    [false, true].forEach(isShiny => {
      if (isShiny) {
        const shinyEntry = gameState.fishIndex[`${fish.id}|shiny`];
        if (!shinyEntry) return;
      }
      rows.push({ fish, isShiny });
    });
  });

  const filtered = rows.filter(({ fish, isShiny }) => {
    const discovered = !!gameState.fishIndex[isShiny ? `${fish.id}|shiny` : fish.id];
    if (showShinyOnly && !isShiny) return false;
    if (activeRarities.length > 0 && !activeRarities.includes(fish.rarity)) return false;
    if (searchTerm && discovered && !fish.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (searchTerm && !discovered) return false;
    return true;
  }).sort((a, b) => rarityIndex(b.fish.rarity) - rarityIndex(a.fish.rarity));

  let restoreSel = null;
  if (container.contains(document.activeElement)) {
    const ae = document.activeElement;
    if (ae.id) restoreSel = `#${ae.id}`;
    else if (ae.dataset && ae.dataset.rarity) restoreSel = `.${ae.className.trim()}[data-rarity="${ae.dataset.rarity}"]`;
  }

  container.innerHTML = `
    <div style="text-align:center; color:#b9c2de; font-size:0.85em; margin-bottom:0.3em;">Discovered ${discoveredCount} / ${fishCatalogue.length} species</div>
    <div style="text-align:center; font-size:0.72em; margin-bottom:0.8em; line-height:1.8;">${rarityBreakdown}</div>
    ${buildFilterBarHtml('index', activeRarities, showShinyOnly)}
    <div id="index-results" tabindex="0" role="region" aria-label="Fish index results" class="style-7"></div>
  `;

  const searchInput = document.getElementById('index-search');
  if (searchInput) searchInput.value = searchTerm;

  if (restoreSel) document.querySelector(restoreSel)?.focus();

  const resultsDiv = document.getElementById('index-results');
  if (filtered.length === 0) {
    resultsDiv.innerHTML = '<div class="empty-message">No matching entries.</div>';
  } else {
    filtered.forEach(({ fish, isShiny }) => {
      const key = isShiny ? `${fish.id}|shiny` : fish.id;
      const entry = gameState.fishIndex[key];
      const discovered = !!entry;
      const rarity = fishRarities.find(r => r.name === fish.rarity);

      const div = document.createElement('div');
      div.style.cssText = `
        background: rgba(0,0,0,0.3); padding: 1em; margin-bottom: 0.8em; border-radius: 8px;
        border: 2px solid ${discovered ? rarity.color : '#3a3f54'};
        ${discovered && isShiny ? 'box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);' : ''}
        display: flex; align-items: center; gap: 1em;
      `;

      if (discovered) {
        const locNames = fish.locations.map(id => getLocationById(id).name).join(', ');
        div.innerHTML = `
          <img src="${getFishImage(fish.id)}" alt="" style="width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated;">
          <div style="flex: 1;">
            <div style="color: ${rarity.color}; font-weight: bold; margin-bottom: 0.2em;">${isShiny ? '<i class="fa-solid fa-star" aria-hidden="true"></i> ' : ''}${fish.name}</div>
            <div style="color: #8b96b5; font-size: 0.78em; margin-bottom: 0.3em; font-style: italic;">${fish.description}</div>
            <div style="color: #b9c2de; font-size: 0.78em;">${fish.rarity} · ${locNames} · Caught ${entry.count}x</div>
            <div style="color: #b9c2de; font-size: 0.78em;">Size: ${formatWeight(entry.minWeight)} – ${formatWeight(entry.maxWeight)}</div>
          </div>
        `;
      } else {
        div.innerHTML = `
          <div style="width:48px; height:48px; border-radius:6px; background:#11151f; display:flex; align-items:center; justify-content:center; font-size:1.4em; color:#3a3f54;">?</div>
          <div style="flex: 1;">
            <div style="color: #5b6580; font-weight: bold;">??? </div>
            <div style="color: #4a5570; font-size: 0.78em;">${fish.rarity} · Not yet discovered</div>
          </div>
        `;
      }
      resultsDiv.appendChild(div);
    });
  }

  ['index-search-btn', 'index-reset-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'index-search-btn') el.addEventListener('click', () => updateIndexTab());
    else el.addEventListener('click', () => {
      const searchInput = document.getElementById('index-search');
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('.index-rarity-filter').forEach(f => f.checked = false);
      const shinyFilter = document.getElementById('index-shiny-filter');
      if (shinyFilter) shinyFilter.checked = false;
      updateIndexTab();
    });
  });
  if (searchInput) searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') updateIndexTab(); });
  document.querySelectorAll('.index-rarity-filter').forEach(f => f.addEventListener('change', () => updateIndexTab()));
  const shinyFilter = document.getElementById('index-shiny-filter');
  if (shinyFilter) shinyFilter.addEventListener('change', () => updateIndexTab());
}

function updateUpgradesTab() {
  const container = document.getElementById('upgrade-list');
  if (!container) return;

  const upgrades = [
    {
      name: 'Auto Fish',
      shopIcon: () => 'rod-auto',
      desc: `Casts and reels for you at your current cast speed in ${getAutoFishBurstSeconds()}-second bursts while the Fishing tab is open — press it again when a burst ends; switching tabs stops it. Owning it also speeds up catches while you’re away (base: one every 90s instead of every 5 min).`
        + (gameState.level >= AUTO_FISH_UNLOCK_LEVEL ? '' : ` Requires level ${AUTO_FISH_UNLOCK_LEVEL}.`),
      cost: 80000,
      level: gameState.autoFishUnlocked ? 1 : 0,
      max: 1,
      levelRequired: AUTO_FISH_UNLOCK_LEVEL,
      buy: () => {
        gameState.coins -= 80000;
        gameState.totalSpent += 80000;
        gameState.autoFishUnlocked = true;
        updateAllUI(); saveState(); checkAchievements();
        celebrateMilestone('Auto Fish unlocked!', 'Press Auto Fish on the Fishing tab to start a burst.', '#8e44ad');
      }
    },
    ...(TRIPLE_HOOK_CONFIG.cost !== null && TRIPLE_HOOK_CONFIG.unlockLevel !== null ? [{
      name: 'Triple Hook',
      shopIcon: () => `hook-${gameState.tripleHookUnlocked ? 1 : 0}`,
      desc: 'Every cast lands three reveals at once instead of one - applies to Auto Fish too.',
      cost: TRIPLE_HOOK_CONFIG.cost,
      level: gameState.tripleHookUnlocked ? 1 : 0,
      max: 1,
      levelRequired: TRIPLE_HOOK_CONFIG.unlockLevel,
      buy: () => {
        gameState.coins -= TRIPLE_HOOK_CONFIG.cost;
        gameState.totalSpent += TRIPLE_HOOK_CONFIG.cost;
        gameState.tripleHookUnlocked = true;
        updateAllUI(); saveState(); checkAchievements();
        celebrateMilestone('Triple Hook!', 'Every cast now lands three catches.', '#4fd1a5');
      }
    }] : []),
    {
      name: 'Fishing Rod',
      shopIcon: () => `rod-${gameState.reelSpeedLevel + 1}`,
      desc: `Boosts Reel Speed, cutting casting time for both manual and Auto Fish (currently ${getCastTimeMs()}ms)`,
      cost: Math.round(getScaledCost([12000, 40000, 120000][gameState.reelSpeedLevel]) * getMoneyDiscountMultiplier()),
      level: gameState.reelSpeedLevel,
      max: 3,
      buy: () => {
        const cost = Math.round(getScaledCost([12000, 40000, 120000][gameState.reelSpeedLevel]) * getMoneyDiscountMultiplier());
        gameState.coins -= cost; gameState.totalSpent += cost; gameState.reelSpeedLevel++;
        updateAllUI(); saveState(); checkAchievements();
      }
    },
    {
      name: 'Luck',
      icon: 'clover', iconColor: () => UPGRADE_LEVEL_COLORS[gameState.luckLevel],
      desc: `Improves rare-fish odds (currently +${(getTotalLuck() * 100).toFixed(1)}%)`,
      cost: Math.round([18000, 50000, 150000][gameState.luckLevel] * getMoneyDiscountMultiplier()),
      level: gameState.luckLevel,
      max: 3,
      buy: () => {
        const cost = Math.round([18000, 50000, 150000][gameState.luckLevel] * getMoneyDiscountMultiplier());
        gameState.coins -= cost; gameState.totalSpent += cost; gameState.luckLevel++;
        updateAllUI(); saveState(); checkAchievements();
      }
    },
    ...(hasSkillEffect('unlockIdleEfficiency') ? [{
      name: 'Idle Efficiency',
      icon: 'sleep', iconColor: () => UPGRADE_LEVEL_COLORS[Math.min(gameState.idleEfficiencyLevel, 3)],
      desc: `Shortens the gap between catches while you're away, and raises how many you can bank per visit (currently ${Math.round(getOfflineIntervalMs() / 1000)}s/catch, up to ${getOfflineMaxCatches()} catches). Repeatable - no cap.`,
      cost: Math.round(getIdleEfficiencyCost(gameState.idleEfficiencyLevel) * getMoneyDiscountMultiplier()),
      level: gameState.idleEfficiencyLevel,
      max: Infinity,
      numeric: true,
      buy: () => {
        const cost = Math.round(getIdleEfficiencyCost(gameState.idleEfficiencyLevel) * getMoneyDiscountMultiplier());
        gameState.coins -= cost; gameState.totalSpent += cost; gameState.idleEfficiencyLevel++;
        updateAllUI(); saveState(); checkAchievements();
      }
    }] : []),
    ...(hasSkillEffect('unlockRenown') ? [{
      name: 'Angler’s Renown',
      icon: 'crown', iconColor: () => UPGRADE_LEVEL_COLORS[Math.min(gameState.renownLevel, 3)],
      desc: `Every catch pays out more as your renown grows (currently +${(gameState.renownLevel * RENOWN_BONUS_PER_LEVEL * 100).toFixed(0)}%). Repeatable - no cap.`,
      cost: getRenownCost(gameState.renownLevel),
      level: gameState.renownLevel,
      max: Infinity,
      numeric: true,
      spotlight: true,
      buy: () => {
        const cost = getRenownCost(gameState.renownLevel);
        gameState.coins -= cost; gameState.totalSpent += cost; gameState.renownLevel++;
        updateAllUI(); saveState(); checkAchievements();
      }
    }] : [])
  ];

  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.style.cssText = 'display: grid; gap: 1em;';

  upgrades.forEach(up => {
    const meetsLevel = !up.levelRequired || gameState.level >= up.levelRequired;
    const canAfford = gameState.coins >= up.cost;
    const isMaxed = up.level >= up.max;
    const buyable = !isMaxed && canAfford && meetsLevel;
    const romanNumerals = ['I', 'II', 'III'];
    const displayName = up.numeric
      ? (up.level > 0 ? `${up.name} ${up.level}` : up.name)
      : (up.max > 1 && !isMaxed ? `${up.name} ${romanNumerals[up.level]}` : up.name);

    const div = document.createElement('div');
    if (up.spotlight) div.className = 'renown-spotlight';
    div.style.cssText = `
      background: rgba(0,0,0,0.3); padding: 1.5em; border-radius: 8px;
      border: 2px solid ${up.spotlight ? '#ffd700' : isMaxed ? '#23d160' : '#4a90a4'};
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1em;
    `;
    const upIcon = up.shopIcon
      ? `<img src="assets/icons/shop/${up.shopIcon()}.png" alt="" class="upgrade-icon"> `
      : up.icon ? `${pxIcon(up.icon, { color: up.iconColor(), size: '32px' })} ` : '';
    div.innerHTML = `
      <div style="max-width: 480px; flex: 1 1 280px; min-width: 0;">
        <div style="font-size: 1.2em; margin-bottom: 0.4em;">${upIcon}${displayName}</div>
        <div style="color: #b9c2de; font-size: 0.85em; line-height: 1.6; margin-bottom: 0.6em;">${up.desc}</div>
        <div style="color: ${isMaxed ? '#23d160' : '#ffd700'}; font-size: 0.9em; display:flex; align-items:center; gap:0.3em;">
          ${isMaxed ? 'MAX LEVEL' : `Cost: <img src="assets/icons/currency/coin.png" alt="" class="currency-icon"> ${formatNumber(up.cost)}`}
        </div>
      </div>
      <button class="pixel-btn" ${buyable ? '' : 'disabled'} style="padding: 0.8em 1.5em; background: ${isMaxed ? '#666' : buyable ? '#23d160' : '#666'}; color: ${buyable ? '#12151d' : '#fff'}; margin-left: auto;">
        ${isMaxed ? 'Maxed' : !meetsLevel ? `Requires Lv. ${up.levelRequired}` : canAfford ? 'Buy' : 'Need coins'}
      </button>
    `;
    const btn = div.querySelector('button');
    if (buyable) btn.addEventListener('click', () => { up.buy(); playSfx('unlock'); tutorialNotify('upgrade'); });
    grid.appendChild(div);
  });

  container.appendChild(grid);
}

const BRANCH_COLORS = { center: '#e0eaff', luck: '#4a90d9', money: '#ffd700', speed: '#4fd1a5', storage: '#c48ce8' };
const BRANCH_ICON_CLASS = { center: 'compass', luck: 'clover', money: 'coin-purse', speed: 'bolt', storage: 'wooden-crate' };
const NODE_SIZE = 76;
const MAP_PADDING = 90;
let skillTreeWasVisible = false;

function pxIcon(name, { color = '', size = '' } = {}) {
  const style = `--px-icon:url('${new URL(`assets/icons/ui/${name}.png`, document.baseURI).href}');${color ? `color:${color};` : ''}${size ? `font-size:${size};` : ''}`;
  return `<i class="px-icon" style="${style}" aria-hidden="true"></i>`;
}

const UPGRADE_LEVEL_COLORS = ['#b0c4b1', '#4299e1', '#e67e22', '#ffd700'];

function formatShortNumber(n) {
  n = n || 0;
  return Math.abs(n) < 1000 ? String(Math.floor(n)) : numberFormatterCompact.format(n);
}

function formatSkillCostShortHtml(cost) {
  const parts = [];
  if (cost.rebirthPoints) parts.push(`${formatShortNumber(cost.rebirthPoints)} SP`);
  if (cost.coins) parts.push(`${formatShortNumber(cost.coins)}<img src="assets/icons/currency/coin.png" alt="" class="skilltree-price-icon">`);
  if (cost.pearls) parts.push(`${formatShortNumber(cost.pearls)}<img src="assets/icons/currency/pearl.png" alt="" class="skilltree-price-icon">`);
  return parts.map(x => `<span class="skilltree-price-part">${x}</span>`).join('');
}

function formatSkillCost(cost) {
  const parts = [];
  if (cost.rebirthPoints) parts.push(`${cost.rebirthPoints} SP`);
  if (cost.coins) parts.push(`${formatNumber(cost.coins)} coins`);
  if (cost.pearls) parts.push(`${formatNumber(cost.pearls)} Pearls`);
  return parts.join(' + ');
}

function attemptSkillNodePurchase(node) {
  const status = getNodeStatus(node, gameState.skillTreeUnlocked);
  if (status === 'silhouette') return;
  if (status === 'owned' && node.tier !== 'cycle') return;

  const cost = getSkillNodeCost(node);
  if (!canAffordNode({ cost }, gameState)) {
    const rpShort = (cost.rebirthPoints || 0) > (gameState.rebirthPoints || 0);
    showNotification(`Need ${formatSkillCost(cost)} for ${node.name}${rpShort ? `. Every level up earns ${REBIRTH_POINTS_PER_LEVEL} Skill Point${REBIRTH_POINTS_PER_LEVEL === 1 ? '' : 's'} (SP).` : ''}`);
    return;
  }
  if (isTutorialActive() && gameState.tutorialStep === 'skilltree') {
    if (purchaseSkillNode(node.id)) playSfx('unlock');
    return;
  }
  openSkillPurchaseConfirm(node);
}

let skillConfirmReturnNodeId = null;

function isSkillConfirmOpen() {
  const overlay = document.getElementById('skill-confirm-overlay');
  return !!overlay && overlay.style.display === 'flex';
}

function openSkillPurchaseConfirm(node) {
  const overlay = document.getElementById('skill-confirm-overlay');
  if (!overlay) return;
  if (isSkillConfirmOpen()) return;
  const level = getSkillNodeLevel(node.id);
  const target = node.tier === 'cycle'
    ? `${node.name} ${level > 0 ? `Lv. ${level} → ${level + 1}` : `Lv. ${level + 1}`}`
    : node.name;
  document.getElementById('skill-confirm-target').textContent = target;
  document.getElementById('skill-confirm-cost').textContent = formatSkillCost(getSkillNodeCost(node));
  skillConfirmReturnNodeId = node.id;
  overlay.style.display = 'flex';
  document.getElementById('skill-confirm-cancel').focus();
}

function closeSkillPurchaseConfirm() {
  if (!isSkillConfirmOpen()) return;
  document.getElementById('skill-confirm-overlay').style.display = 'none';
  const id = skillConfirmReturnNodeId;
  skillConfirmReturnNodeId = null;
  if (id) document.querySelector(`#skilltree [data-node-id="${id}"]`)?.focus();
}

function setupSkillConfirm() {
  const overlay = document.getElementById('skill-confirm-overlay');
  if (!overlay) return;
  const cancelBtn = document.getElementById('skill-confirm-cancel');
  const purchaseBtn = document.getElementById('skill-confirm-purchase');

  const cancelRepeat = (e) => { if (e.repeat) e.preventDefault(); };
  cancelBtn.addEventListener('keydown', cancelRepeat);
  purchaseBtn.addEventListener('keydown', cancelRepeat);

  cancelBtn.addEventListener('click', () => closeSkillPurchaseConfirm());
  purchaseBtn.addEventListener('click', () => {
    const id = skillConfirmReturnNodeId;
    const treeWasComplete = isSkillTreeComplete();
    const ok = id ? purchaseSkillNode(id) : false;
    closeSkillPurchaseConfirm();
    if (ok) celebrateSkillNodePurchase(id, treeWasComplete);
    if (!ok && id) {
      const node = getNodeById(id);
      if (node) showNotification(`Need ${formatSkillCost(getSkillNodeCost(node))} for ${node.name}`);
    }
  });
}

function showSkillTooltip(node, targetEl) {
  const tooltip = document.getElementById('skilltree-tooltip');
  if (!tooltip || !targetEl) return;

  const status = getNodeStatus(node, gameState.skillTreeUnlocked);
  if (status === 'silhouette') return;

  const cost = getSkillNodeCost(node);
  const level = getSkillNodeLevel(node.id);
  const isCycle = node.tier === 'cycle';
  const costLabel = status === 'owned' && !isCycle ? 'Owned' : formatSkillCost(cost);

  tooltip.innerHTML = `
    <div class="skilltree-tooltip-name" style="color:${BRANCH_COLORS[node.branch] || '#fff'};">${node.name}${isCycle && level > 0 ? ` (level ${level})` : ''}</div>
    <div class="skilltree-tooltip-cost">${costLabel}</div>
    <div class="skilltree-tooltip-desc">${node.description}</div>
  `;

  const rect = targetEl.getBoundingClientRect();
  tooltip.classList.add('visible');
  const tooltipRect = tooltip.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow > tooltipRect.height + 12
    ? rect.bottom + 8
    : rect.top - tooltipRect.height - 8;
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function hideSkillTooltip() {
  const tooltip = document.getElementById('skilltree-tooltip');
  tooltip?.classList.remove('visible');
  if (tooltip) tooltip.innerHTML = '';
}

function closeSkillTreeModal() {
  switchToTab('fishing');
  document.querySelector('.tab-btn[data-tab="skilltree"]')?.focus();
}

function updateSkillTreeTab() {
  const header = document.getElementById('skilltree-header');
  const map = document.getElementById('skilltree-map');
  if (!header || !map) return;

  const focusedNodeId = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.nodeId : null;

  hideSkillTooltip();

  const closeBtn = document.getElementById('skilltree-close-btn');
  if (closeBtn) closeBtn.onclick = closeSkillTreeModal;

  const canRespec = gameState.rebirthPoints >= RESPEC_COST_REBIRTH_POINTS;
  header.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6em;">
      <div>Skill Points: <strong style="color:#ffd700;">${gameState.rebirthPoints}</strong> (earned every level up) - spend them on the compass below. Silhouetted nodes are what's coming next; click an unlocked one to see it.</div>
      <button id="skilltree-respec-btn" class="pixel-btn" ${canRespec ? '' : 'disabled'} style="font-size:0.7em; padding:0.5em 0.9em; background:${canRespec ? '#8e44ad' : '#666'}; color:#fff;" title="${canRespec ? '' : `Requires ${RESPEC_COST_REBIRTH_POINTS} Skill Points`}">
        Respec (${RESPEC_COST_REBIRTH_POINTS} Skill Points)
      </button>
    </div>
  `;
  const respecBtn = document.getElementById('skilltree-respec-btn');
  if (respecBtn && canRespec) {
    respecBtn.addEventListener('click', () => {
      if (confirm('Respec the whole skill tree? Every Skill Point you\'ve spent on it is refunded, but every node resets and needs to be re-bought.')) {
        respecSkillTree();
      }
    });
  }

  const xs = skillTreeNodes.map(n => n.position.x);
  const ys = skillTreeNodes.map(n => n.position.y);
  const minX = Math.min(...xs) - MAP_PADDING, maxX = Math.max(...xs) + MAP_PADDING;
  const minY = Math.min(...ys) - MAP_PADDING, maxY = Math.max(...ys) + MAP_PADDING;
  const width = maxX - minX, height = maxY - minY;
  const toPx = (p) => ({ left: p.x - minX, top: p.y - minY });


  const canvas = document.createElement('div');
  canvas.style.cssText = `position: relative; width: ${width}px; height: ${height}px;`;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';

  skillTreeNodes.forEach(node => {
    if (!node.prerequisiteId) return;
    const parent = getNodeById(node.prerequisiteId);
    if (!parent) return;
    const a = toPx(parent.position), b = toPx(node.position);
    const parentOwned = !!gameState.skillTreeUnlocked[parent.id];

    const dx = b.left - a.left, dy = b.top - a.top;
    const dist = Math.hypot(dx, dy) || 1;
    const trim = NODE_SIZE / 2 + 4;
    const ux = dx / dist, uy = dy / dist;
    const x1 = a.left + ux * trim, y1 = a.top + uy * trim;
    const x2 = b.left - ux * trim, y2 = b.top - uy * trim;

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', parentOwned ? (BRANCH_COLORS[node.branch] || '#4a90a4') : '#2a2f44');
    line.setAttribute('stroke-width', '3');
    svg.appendChild(line);
  });
  canvas.appendChild(svg);

  const tutorialTarget = isTutorialActive() && gameState.tutorialStep === 'skilltree' ? 'start' : null;

  skillTreeNodes.forEach(node => {
    const status = getNodeStatus(node, gameState.skillTreeUnlocked);
    const p = toPx(node.position);
    const color = BRANCH_COLORS[node.branch] || '#4a90a4';
    const level = getSkillNodeLevel(node.id);
    const isTutorialTarget = node.id === tutorialTarget && status !== 'owned';
    const iconName = node.icon || BRANCH_ICON_CLASS[node.branch] || 'compass';

    const isCycle = node.tier === 'cycle';
    const buyable = status !== 'silhouette' && (status !== 'owned' || isCycle);
    const cost = buyable ? getSkillNodeCost(node) : null;
    const affordable = buyable ? canAffordNode({ cost }, gameState) : true;
    const unaffordable = buyable && !affordable;

    const div = document.createElement('div');
    div.className = `skilltree-node-pixel${isTutorialTarget ? ' renown-spotlight' : ''}`;
    div.dataset.nodeId = node.id;
    div.style.cssText = `
      position: absolute; left: ${p.left - NODE_SIZE / 2}px; top: ${p.top - NODE_SIZE / 2}px;
      width: ${NODE_SIZE}px; height: ${NODE_SIZE}px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: ${status === 'silhouette' ? 'default' : unaffordable ? 'not-allowed' : 'pointer'};
      border: 3px solid ${isTutorialTarget ? '#ffd700' : status === 'silhouette' ? '#2a2f44' : color};
      background: ${status === 'owned' ? color + '33' : status === 'silhouette' ? '#12151d' : '#1a1e2c'};
      color: ${status === 'silhouette' ? '#3a3f54' : color};
      filter: ${status === 'silhouette' ? 'grayscale(1) brightness(0.6)' : unaffordable ? 'grayscale(0.85) brightness(0.7)' : 'none'};
      opacity: ${unaffordable ? '0.75' : '1'};
      box-shadow: ${status === 'owned' && isCycle ? `0 0 10px 1px ${color}` : 'none'};
    `;
    div.title = status === 'silhouette' ? '???' : node.name;

    const badge = (status !== 'silhouette' && isCycle && level > 0)
      ? `<span class="skilltree-node-badge">${level}</span>` : '';
    const iconSize = Math.round(NODE_SIZE * 0.44);
    const iconEl = status === 'silhouette'
      ? `<i class="fa-solid fa-question" style="font-size:${Math.round(NODE_SIZE * 0.4)}px;" aria-hidden="true"></i>`
      : `<img src="assets/icons/skills/${iconName}.png" alt="" style="width:${iconSize}px; height:${iconSize}px; image-rendering: pixelated;" aria-hidden="true">`;
    const priceEl = buyable
      ? `<div class="skilltree-node-price" data-for="${node.id}" aria-hidden="true" style="color:${unaffordable ? '#8a93ad' : '#ffd700'};">${formatSkillCostShortHtml(cost)}</div>`
      : '';
    div.innerHTML = `${iconEl}${priceEl}${badge}`;
    if (buyable) div.classList.add('skilltree-node-priced');

    if (status !== 'silhouette') {
      div.setAttribute('role', 'button');
      div.setAttribute('tabindex', '0');
      div.setAttribute('aria-label', node.name);
      div.setAttribute('aria-describedby', 'skilltree-tooltip');
      if (unaffordable || (status === 'owned' && !isCycle)) div.setAttribute('aria-disabled', 'true');
      div.addEventListener('click', () => attemptSkillNodePurchase(node));
      div.addEventListener('mouseenter', () => showSkillTooltip(node, div));
      div.addEventListener('mouseleave', hideSkillTooltip);
      div.addEventListener('focus', () => showSkillTooltip(node, div));
      div.addEventListener('blur', hideSkillTooltip);
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (e.repeat) return;
          attemptSkillNodePurchase(node);
        }
      });
    }
    canvas.appendChild(div);
  });

  map.innerHTML = '';
  map.appendChild(canvas);

  if (focusedNodeId) map.querySelector(`[data-node-id="${focusedNodeId}"]`)?.focus();

  const isVisibleNow = document.getElementById('skilltree')?.classList.contains('active');
  if (isVisibleNow && !skillTreeWasVisible) {
    map.scrollLeft = Math.max(0, -minX - map.clientWidth / 2);
    map.scrollTop = Math.max(0, -minY - map.clientHeight / 2);
  }
  skillTreeWasVisible = !!isVisibleNow;
}

function updateRebirthTab() {
  const container = document.getElementById('rebirth-content');
  if (!container) return;

  const eligible = canRebirth();
  const currentBonus = getRebirthBonus();
  const nextBonus = (gameState.rebirthCount + 1) * REBIRTH_BONUS_PER_LEVEL;
  const nextPoints = getRebirthPointsAward();

  let lockedLine = '';
  let lockTitle = '';
  if (!eligible) {
    const next = locations.find(l => !(gameState.unlockedLocations || []).includes(l.id));
    const reqs = [];
    if (next) {
      if (gameState.level < next.unlockLevel) reqs.push(`Lv. ${next.unlockLevel}`);
      const cost = getScaledCost(next.unlockCost);
      if (cost > 0) reqs.push(`${formatNumber(cost)} coins`);
    }
    const where = next ? `${next.name}${reqs.length ? ` requires ${reqs.join(' & ')}` : ''}` : 'another fishing location';
    lockedLine = `
      <div style="color:#ff6b6b; font-size:0.85em; margin-bottom:0.6em;"><i class="fa-solid fa-lock" aria-hidden="true"></i> Locked: this run hasn't unlocked another fishing location &mdash; ${where}. Rebirth resets your locations, so you must unlock one again after every Rebirth.</div>`;
    lockTitle = `Requires unlocking another fishing location this run${reqs.length ? ` (${where})` : ''}`;
  }

  container.innerHTML = `
    <div style="display:flex; gap:2em; flex-wrap:wrap; margin:1em 0;">
      <div>Rebirths so far: <strong style="color:#ffd700;">${gameState.rebirthCount}</strong></div>
      <div>Skill Points: <strong style="color:#ffd700;">${gameState.rebirthPoints}</strong></div>
      <div>Current Rebirth Bonus: <strong style="color:#4fd1a5;">+${(currentBonus * 100).toFixed(0)}%</strong> Luck/Money/Speed</div>
    </div>
    <div style="background: rgba(0,0,0,0.3); border: 2px solid #4a90a4; border-radius: 8px; padding: 1.2em; max-width: 700px; margin-bottom: 1em; line-height: 1.6;">
      ${lockedLine}
      <div style="font-size:1.05em; margin-bottom:0.6em;">Rebirthing now would:</div>
      <div style="color:#ff6b6b; font-size:0.85em; margin-bottom:0.4em;">Reset: coins, Pearls, Fishing Rod, unlocked locations, bag contents, your Renown level, and the repeatable skill-tree nodes (Fortune Uncapped, Overflow Cushion).</div>
      <div style="color:#4fd1a5; font-size:0.85em; margin-bottom:0.8em;">Survives: your level and XP, Luck upgrades, Auto Fish, Triple Hook, Idle Efficiency, every other skill-tree node you've bought (Renown's own unlock included), relic shards, your Fish Index and junk collection, achievements, lifetime stats, Skill Points, your Rebirth Bonus itself, and any potion, chum, or chest boost still running.</div>
      <div style="color:#b9c2de; font-size:0.85em;">Reward: Rebirth Bonus rises to <strong style="color:#4fd1a5;">+${(nextBonus * 100).toFixed(0)}%</strong>, and you gain <strong style="color:#ffd700;">${nextPoints} Skill Points</strong> (spent on the skill tree itself, and on respecs).</div>
    </div>
    <button id="rebirth-btn" class="pixel-btn" ${eligible ? '' : 'disabled'} style="padding: 0.8em 1.5em; ${eligible ? 'background: #e74c3c; color: #12151d;' : 'background: #666; color: #fff;'}" title="${lockTitle}">Rebirth</button>
  `;

  const btn = document.getElementById('rebirth-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!canRebirth()) return;
      if (confirm('Rebirth now? Coins, Pearls, your Fishing Rod, unlocked locations, bag contents, your Renown level, and the two repeatable skill-tree nodes (Fortune Uncapped, Overflow Cushion) reset. Everything else - your level, Luck, Auto Fish, Triple Hook, other skill-tree nodes, relic shards, achievements, and Fish Index - survives. This cannot be undone.')) {
        const pointsGained = getRebirthPointsAward();
        if (performRebirth()) showRebirthMoment(gameState.rebirthCount, pointsGained, getRebirthBonus());
      }
    });
  }
}

function updateRelicsTab() {
  const container = document.getElementById('relics-list');
  if (!container) return;

  container.innerHTML = `
    <p class="system-blurb">
      Eight relics of the Tideheart lie lost in the cove’s deepest waters.<br>
      Each one you recover permanently strengthens your Luck or Reel Speed.
    </p>
  `;

  const grid = document.createElement('div');
  grid.className = 'relics-grid';
  grid.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 1em;';

  relicShards.forEach(shard => {
    const collected = !!gameState.collectedShards[shard.id];
    const bonus = `+${Math.round(shard.value * 100)}% ${shard.type === 'luck' ? 'Luck' : 'Reel Speed'}`;
    const div = document.createElement('div');
    div.className = `relic-card${collected ? '' : ' relic-card-locked'}`;
    div.style.cssText = `
      padding: 1em; border: 2px solid ${collected ? shard.color : '#444'}; border-radius: 10px;
      background: rgba(0,0,0,0.3); text-align: center; transition: all 0.3s;
      box-sizing: border-box; min-width: 0; overflow-wrap: break-word; word-break: normal;
    `;
    div.innerHTML = `
      <img src="assets/relics/${shard.image}" alt="${collected ? '' : 'Unrecovered relic'}" class="relic-card-img"
        style="width:64px; height:64px; image-rendering: pixelated; object-fit: contain; filter: ${collected ? `drop-shadow(0 0 6px ${shard.color})` : 'brightness(0) opacity(0.55)'};">
      <div class="relic-card-name" style="margin-top: 0.5em; font-size: 0.75em; color: ${collected ? shard.color : '#888'};">${collected ? shard.name : '???'}</div>
      ${collected ? `<div class="relic-card-desc" style="margin-top: 0.4em; color: #b8c2d8; font-size: 0.6em; line-height: 1.5;">${shard.description}</div>` : ''}
      <div class="relic-card-bonus" style="margin-top: 0.4em; color: ${collected ? shard.color : '#666'}; font-size: 0.68em;">
        ${collected ? bonus : 'Locked'}
      </div>
    `;
    grid.appendChild(div);
  });

  container.appendChild(grid);
}

function updateAchievementsTab() {
  const container = document.getElementById('mastery-list');
  if (!container) return;

  const location = getCurrentLocation();
  const activePaceSec = getRevealDurationMs() / 1000;
  const offlineCatchesPerHour = 3600000 / getOfflineIntervalMs();

  const statLine = (icon, html) => `
    <div style="display:flex; align-items:flex-start; gap:0.5em;">
      <span style="flex-shrink:0; margin-top:0.2em; display:inline-flex;">${pxIcon(icon)}</span>
      <span>${html}</span>
    </div>
  `;

  container.innerHTML = `
    <h3 style="margin-bottom: 0.6em;">Your Stats</h3>
    <div style="background:rgba(0,0,0,0.25); border-radius:8px; padding:1em 1.2em; margin-bottom:1.5em; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:0.9em 1.4em; font-size:0.78em; color:#cfd8e8; line-height:1.6;">
      ${statLine('waves', `Casts: <strong>${gameState.timesFished.toLocaleString()}</strong>`)}
      ${statLine('fish', `Lifetime fish: <strong>${gameState.lifetimeFish.toLocaleString()}</strong>`)}
      ${statLine('coin', `Total earned: <strong>${formatNumber(gameState.lifetimeCoinsEarned || 0)}</strong>`)}
      ${statLine('pin', `Location bonus: <strong>x${location.incomeMultiplier.toFixed(2)}</strong>`)}
      ${statLine('lightning', `Active pace: <strong>~${activePaceSec.toFixed(1)}s/catch</strong>`)}
      ${statLine('sleep', `Away catch rate: <strong>~${offlineCatchesPerHour.toFixed(1)}/hr</strong>${gameState.autoFishUnlocked ? '' : ' <span style="color:#7a8399;">(buy Auto Fish to speed this up)</span>'}`)}
      ${statLine('moon', `Caught away: <strong>${(gameState.offlineCatchesLifetime || 0).toLocaleString()}</strong>`)}
      ${statLine('weight', `Heaviest catch: <strong>${formatWeight(gameState.heaviestCatch || null)}</strong>`)}
      ${statLine('trash', `Junk found: <strong>${gameState.junkCaught.toLocaleString()}</strong> <span style="color:#7a8399;">(${Object.keys(gameState.junkIndex).length}/${junkCatalogue.length} kinds)</span>`)}
    </div>
  `;

  Object.keys(ACHIEVEMENTS).forEach(category => {
    const categoryDiv = document.createElement('div');
    categoryDiv.style.marginBottom = '2em';
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; gap: 0.8em;';

    Object.values(ACHIEVEMENTS[category]).forEach(ach => {
      const div = document.createElement('div');
      div.style.cssText = `
        background: rgba(0,0,0,0.3); padding: 1em; border-radius: 8px;
        border: 2px solid ${ach.unlocked ? '#ffd700' : '#666'};
        display: flex; justify-content: space-between; align-items: center; gap: 1em;
        ${ach.unlocked ? 'box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);' : ''}
      `;
      div.innerHTML = `
        <div>
          <div style="font-weight: bold; margin-bottom: 0.3em;">${ach.unlocked ? pxIcon('trophy', { color: '#ffd700' }) : pxIcon('lock', { color: '#8a93ad' })} ${ach.name}</div>
          <div style="color: #b9c2de; font-size: 0.85em;">${ach.desc}</div>
        </div>
        <div style="color: ${ach.unlocked ? '#ffd700' : '#666'}; font-weight: bold; white-space: nowrap; display: flex; align-items: center; gap: 0.3em;">
          <img src="assets/icons/currency/pearl.png" alt="" class="currency-icon">${ach.reward}
        </div>
      `;
      grid.appendChild(div);
    });
    categoryDiv.appendChild(grid);
    container.appendChild(categoryDiv);
  });
}

function updateChestsTab() {
  const container = document.getElementById('crates-list');
  if (!container) return;

  const chests = [
    { name: 'Small Chest', cost: 50, img: 'smallchest.png', type: 'small', desc: '100-600 Coins, or 1-5 Common fish' },
    { name: 'Big Chest', cost: 100, img: 'bigchest.png', type: 'big', desc: '10-30 Pearls, 500-1500 Coins, a Luck Boost, or fish (1-10 Common or 1 Rare)' },
    { name: 'Sunken Chest', cost: 175, img: 'sunkenchest.png', type: 'sunken', desc: 'Reel Speed Boost, a bigger Luck Boost, 20-50 Pearls, or fish (1-20 Common or 1-2 Rare)' },
    { name: 'Deep Chest', cost: 250, img: 'bosschest.png', type: 'boss', desc: 'Tideheart Relic, Reel Speed Boost, 30-80 Pearls, 50-100 Pearls if all relics are owned, or fish (5-20 Common, 2-3 Rare, or 1 Epic)' }
  ];

  container.innerHTML = '';

  chests.forEach(chest => {
    const canAfford = gameState.pearls >= chest.cost;
    const div = document.createElement('div');
    div.style.cssText = `
      background: rgba(0,0,0,0.3); padding: 1.5em; border-radius: 8px;
      border: 2px solid ${canAfford ? '#8e44ad' : '#666'}; margin-bottom: 1em;
      display: flex; justify-content: space-between; align-items: center; gap: 1em; flex-wrap: wrap;
    `;
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1em; flex: 1 1 280px; min-width: 0;">
        <img src="assets/chests/${chest.img}" alt="" style="width: 64px; height: 64px; image-rendering: pixelated; flex-shrink: 0;">
        <div style="min-width: 0;">
          <div style="font-size: 1.2em; margin-bottom: 0.3em;">${chest.name}</div>
          <div style="color: #b9c2de; font-size: 0.85em; margin-bottom: 0.5em;">Rewards: ${chest.desc}</div>
          <div style="color: #ffd700; font-size: 0.9em; display: flex; align-items: center; gap: 0.3em;">
            Cost: <img src="assets/icons/currency/pearl.png" alt="" class="currency-icon"> ${chest.cost}
          </div>
        </div>
      </div>
      <button class="pixel-btn open-chest-btn" data-type="${chest.type}" ${canAfford ? '' : 'disabled'}
        style="padding: 0.8em 1.5em; background: ${canAfford ? '#8e44ad' : '#666'}; color: #fff; margin-left: auto;">
        ${canAfford ? 'Open' : 'Need Pearls'}
      </button>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll('.open-chest-btn').forEach(btn => {
    btn.addEventListener('click', () => openChest(btn.dataset.type));
  });
}

function grantChestLuckBoost(amount) {
  const boosts = gameState.temporaryBoosts;
  if (!isChestBuffActive(boosts.luckGrantedAt)) boosts.luck = 0;
  boosts.luck += amount;
  boosts.luckGrantedAt = Date.now();
}

function grantChestReelBoost(amount) {
  const boosts = gameState.temporaryBoosts;
  if (!isChestBuffActive(boosts.reelSpeedGrantedAt)) boosts.reelSpeed = 0;
  boosts.reelSpeed += amount;
  boosts.reelSpeedGrantedAt = Date.now();
}

const CHEST_FISH_FROM = 0.75;

function randomIntInclusive(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function rollChestFish(type) {
  const r = Math.random();
  if (type === 'small') return { rarityName: 'Common', count: randomIntInclusive(1, 5) };
  if (type === 'big') return r < 0.75 ? { rarityName: 'Common', count: randomIntInclusive(1, 10) } : { rarityName: 'Rare', count: 1 };
  if (type === 'sunken') return r < 0.75 ? { rarityName: 'Common', count: randomIntInclusive(1, 20) } : { rarityName: 'Rare', count: randomIntInclusive(1, 2) };
  return r < 0.65 ? { rarityName: 'Common', count: randomIntInclusive(5, 20) }
    : r < 0.95 ? { rarityName: 'Rare', count: randomIntInclusive(2, 3) }
    : { rarityName: 'Epic', count: 1 };
}

function sellLeastRareToMakeRoom(incomingRarity) {
  const overflowCommon = hasSkillEffect('unlockCommonOverflow');
  const overflowRare = hasSkillEffect('unlockRareOverflow');
  let best = null;
  Object.entries(gameState.inventory).forEach(([key, item]) => {
    if (item.count <= 0 || item.pinned) return;
    const fish = getFishById(item.fishId);
    if (!fish) return;
    if ((overflowCommon && fish.rarity === 'Common') || (overflowRare && fish.rarity === 'Rare')) return;
    const idx = rarityIndex(fish.rarity);
    if (idx >= rarityIndex(incomingRarity.name)) return;
    if (!best || idx < best.idx || (idx === best.idx && best.item.isShiny && !item.isShiny)) best = { key, item, fish, idx };
  });
  if (!best) return false;
  const value = getSellValue(fishRarities.find(r => r.name === best.fish.rarity), best.item.isShiny, 1);
  gameState.coins += value.coins;
  gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + value.coins;
  best.item.count -= 1;
  if (best.item.count <= 0) delete gameState.inventory[best.key];
  return true;
}

function grantChestFish(type) {
  const { rarityName, count } = rollChestFish(type);
  const rarity = fishRarities.find(r => r.name === rarityName);
  const pool = getFishPoolForLocation(gameState.currentLocation, rarityName);
  const caught = {};
  const newSpecies = [];
  let coins = 0, xp = 0, autoSold = 0, overflowSold = 0, madeRoom = 0;
  const levelBefore = gameState.level;
  for (let i = 0; i < count; i++) {
    const fish = pool[Math.floor(Math.random() * pool.length)];
    const weight = rollFishWeight(fish);
    if (getCappedInventoryCount() >= getInventoryCap()) {
      if (sellLeastRareToMakeRoom(rarity)) {
        madeRoom++;
      } else {
        const value = getSellValue(rarity, false, 1);
        gameState.coins += value.coins;
        gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + value.coins;
        coins += value.coins;
        overflowSold++;
        caught[fish.name] = (caught[fish.name] || 0) + 1;
        continue;
      }
    }
    const summary = grantCatch({ kind: 'fish', fish, rarity, isShiny: false, weight }, { silent: true });
    if (summary.isNewDiscovery) newSpecies.push(fish.name);
    caught[fish.name] = (caught[fish.name] || 0) + 1;
    coins += summary.coins;
    xp += summary.xp;
    if (summary.autoSold) autoSold++;
  }
  const list = items => (items.length > 4 ? `${items.slice(0, 4).join(', ')} +${items.length - 4} more` : items.join(', '));
  const names = list(Object.entries(caught).map(([name, n]) => (n > 1 ? `${name} x${n}` : name)));
  const notes = [`+${formatNumber(coins)} coins, +${formatNumber(xp)} XP`];
  if (autoSold > 0) notes.push(`${autoSold} auto-sold`);
  if (madeRoom > 0) notes.push(`bag full: sold ${madeRoom} lower-rarity fish to make room`);
  if (overflowSold > 0) notes.push(`bag full: ${overflowSold} sold`);
  if (newSpecies.length > 0) notes.push(`new: ${list(newSpecies)}`);
  if (gameState.level > levelBefore) announceLevelUp(levelBefore);
  return `${count} ${rarityName} fish (${names}); ${notes.join('; ')}`;
}

function openChest(type) {
  const costs = { small: 50, big: 100, sunken: 175, boss: 250 };
  const cost = costs[type];
  if (gameState.pearls < cost) return;

  const adoptGenerationBefore = adoptGeneration;
  gameState.pearls -= cost;
  gameState.pearlsSpent += cost;
  playSfx('chest');

  let reward = '';
  const rand = Math.random();

  if (rand >= CHEST_FISH_FROM) {
    reward = grantChestFish(type);
  } else if (type === 'small') {
    const coins = Math.floor(Math.random() * 501) + 100;
    gameState.coins += coins;
    gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + coins;
    reward = `${coins} Coins`;
  } else if (type === 'big') {
    if (rand < 0.3) {
      const luckBoost = (Math.floor(Math.random() * 5) + 1) / 100;
      grantChestLuckBoost(luckBoost);
      reward = `+${(luckBoost * 100).toFixed(0)}% Luck Boost`;
    } else if (rand < 0.5) {
      const pearls = Math.round((Math.floor(Math.random() * 21) + 10) * getPearlGainMultiplier());
      gameState.pearls += pearls;
      reward = `${pearls} Pearls`;
    } else {
      const coins = Math.floor(Math.random() * 1001) + 500;
      gameState.coins += coins;
      gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + coins;
      reward = `${coins} Coins`;
    }
  } else if (type === 'sunken') {
    if (rand < 0.3) {
      const speedBoost = Math.floor(Math.random() * 4) + 3;
      grantChestReelBoost(speedBoost);
      reward = `+${speedBoost} Reel Speed Boost`;
    } else if (rand < 0.6) {
      const luckBoost = (Math.floor(Math.random() * 6) + 3) / 100;
      grantChestLuckBoost(luckBoost);
      reward = `+${(luckBoost * 100).toFixed(0)}% Luck Boost`;
    } else {
      const pearls = Math.round((Math.floor(Math.random() * 31) + 20) * getPearlGainMultiplier());
      gameState.pearls += pearls;
      reward = `${pearls} Pearls`;
    }
  } else if (type === 'boss') {
    if (rand < 0.2) {
      const uncollected = relicShards.filter(s => !gameState.collectedShards[s.id]);
      if (uncollected.length > 0) {
        const shard = uncollected[Math.floor(Math.random() * uncollected.length)];
        gameState.collectedShards[shard.id] = shard;
        reward = `${shard.name}!`;
      } else {
        const pearls = Math.round((Math.floor(Math.random() * 51) + 50) * getPearlGainMultiplier());
        gameState.pearls += pearls;
        reward = `${pearls} Pearls`;
      }
    } else if (rand < 0.4) {
      const speedBoost = Math.floor(Math.random() * 6) + 5;
      grantChestReelBoost(speedBoost);
      reward = `+${speedBoost} Reel Speed Boost`;
    } else {
      const pearls = Math.round((Math.floor(Math.random() * 51) + 30) * getPearlGainMultiplier());
      gameState.pearls += pearls;
      reward = `${pearls} Pearls`;
    }
  }

  if (adoptGeneration !== adoptGenerationBefore) {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw !== null) adoptStoredSave(raw);
    return;
  }

  showNotification(`Chest opened! Received: ${reward}`);
  checkAchievements();
  updateAllUI();
  saveState();
  tutorialNotify('chest');
}


function togglePin(key) {
  const item = gameState.inventory[key];
  if (!item) return;
  item.pinned = !item.pinned;
  updateAllUI();
  saveState();
}

function sellFish(key, forPearls) {
  const item = gameState.inventory[key];
  if (!item || item.count === 0) return;
  const fish = getFishById(item.fishId);
  const rarity = fishRarities.find(r => r.name === fish.rarity);
  const value = getSellValue(rarity, item.isShiny, 1);

  if (forPearls) { if (value.pearls > 0) gameState.pearls += value.pearls; }
  else if (value.coins > 0) {
    gameState.coins += value.coins;
    gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + value.coins;
  }

  item.count -= 1;
  if (item.count <= 0) delete gameState.inventory[key];

  playSfx('coin');
  updateAllUI();
  saveState();
  tutorialNotify('sell');
}

function sellAll(currency) {
  let total = 0;
  let soldAny = false;
  Object.entries(gameState.inventory).forEach(([key, item]) => {
    if (item.count <= 0) return;
    if (item.pinned) return;
    const fish = getFishById(item.fishId);
    if (!fish) return;
    const rarity = fishRarities.find(r => r.name === fish.rarity);
    const value = getSellValue(rarity, item.isShiny, item.count);
    total += currency === 'coins' ? value.coins : value.pearls;
    delete gameState.inventory[key];
    soldAny = true;
  });
  if (soldAny) playSfx('bulkSale');

  if (currency === 'coins') {
    gameState.coins += total;
    gameState.lifetimeCoinsEarned = (gameState.lifetimeCoinsEarned || 0) + total;
    showNotification(`Sold all fish for ${formatNumber(total)} Coins!`);
  }
  else { gameState.pearls += total; showNotification(`Sold all fish for ${formatNumber(total)} Pearls!`); }

  updateAllUI();
  saveState();
  if (soldAny) tutorialNotify('sell');
}

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

function switchToTab(tabId) {
  tabBtns.forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
  tabContents.forEach(tc => tc.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const content = document.getElementById(tabId);
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-current', 'page'); }
  if (content) content.classList.add('active');

  if (tabId !== 'fishing') {
    const autoFishWasRunning = !!autoFishInterval;
    stopAutoFish();
    if (autoFishWasRunning) showNotification('Auto Fish stopped — Fishing tab required.');
  }
  if (elements.fishBtn) elements.fishBtn.style.display = tabId === 'fishing' ? '' : 'none';
  if (elements.autoFishBtn) elements.autoFishBtn.style.display = tabId === 'fishing' && gameState.autoFishUnlocked ? '' : 'none';

  if (tabId === 'skilltree') updateSkillTreeTab();
  else if (tabId === 'inventory') updateInventoryTab();
  else if (tabId === 'index') updateIndexTab();
  else if (tabId === 'mastery') updateAchievementsTab();
  else if (tabId === 'potions') { updatePotionsTab(); updateChumTab(); }

  if (tabId === 'skilltree' && content) content.focus();
  tutorialNotify(`tab:${tabId}`);
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (isTutorialActive() && !TUTORIAL_ALLOWED_TABS[gameState.tutorialStep]?.includes(btn.dataset.tab)) return;
    switchToTab(btn.dataset.tab);
  });
});

window.buyPotion = function (type) {
  const cost = type === 'luck' ? 3000 : 5000;
  if (gameState.coins < cost) { showNotification('Not enough coins!'); return; }
  if (isPotionActive(type)) { showNotification('Potion already active!'); return; }

  gameState.coins -= cost;
  gameState.totalSpent += cost;
  gameState.activePotions[type] = Date.now() + TEMP_BUFF_DURATION_MS;

  playSfx('potion');
  showNotification(`${type === 'luck' ? 'Luck' : 'Reel Speed'} Potion activated!`);
  updateAllUI();
  updatePotionsTab();
  saveState();
  checkAchievements();
  tutorialNotify('potion');
};

function captureCardFocusIndex(container) {
  const ae = document.activeElement;
  if (!ae || !container.contains(ae)) return -1;
  let n = ae;
  while (n && n.parentElement !== container) n = n.parentElement;
  return n ? Array.prototype.indexOf.call(container.children, n) : -1;
}

function restoreCardFocus(container, idx) {
  if (idx < 0) return;
  const btn = container.children[idx] && container.children[idx].querySelector('button');
  if (btn && !btn.disabled) btn.focus();
}

function updatePotionsTab() {
  const container = document.getElementById('potions-list');
  if (!container) return;

  const potions = [
    { type: 'luck', name: 'Luck Draught', cost: 3000, desc: '+10% Luck for 5 minutes' },
    { type: 'reel', name: 'Swift Currents Draught', cost: 5000, desc: '+20 Reel Speed for 5 minutes' }
  ];

  const restoreIdx = captureCardFocusIndex(container);
  container.innerHTML = '';
  potions.forEach(potion => {
    const canAfford = gameState.coins >= potion.cost;
    const isActive = isPotionActive(potion.type);

    const div = document.createElement('div');
    div.style.cssText = `
      background: rgba(0,0,0,0.3); padding: 1.5em; border-radius: 8px;
      border: 2px solid ${isActive ? '#23d160' : canAfford ? '#8e44ad' : '#666'};
      margin-bottom: 1em; display: flex; justify-content: space-between; align-items: center; gap: 1em; flex-wrap: wrap;
    `;

    let timeRemaining = '';
    if (isActive) {
      const sec = Math.ceil((gameState.activePotions[potion.type] - Date.now()) / 1000);
      timeRemaining = `<div style="color: #23d160; font-size: 0.85em; margin-top: 0.3em;">Active: ${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}</div>`;
    }

    const potionIcon = `<img src="assets/icons/shop/${potion.type === 'luck' ? 'potion-luck' : 'potion-speed'}.png" alt="" class="upgrade-icon">`;
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1em; flex: 1 1 280px; min-width: 0;">
        ${potionIcon}
        <div style="min-width: 0;">
          <div style="font-size: 1.2em; margin-bottom: 0.3em;">${potion.name}</div>
          <div style="color: #b9c2de; font-size: 0.85em; margin-bottom: 0.5em;">${potion.desc}</div>
          <div style="color: #ffd700; font-size: 0.9em; display: flex; align-items: center; gap: 0.3em;">
            Cost: <img src="assets/icons/currency/coin.png" alt="" class="currency-icon"> ${formatNumber(potion.cost)}
          </div>
          ${timeRemaining}
        </div>
      </div>
      <button class="pixel-btn" ${!canAfford || isActive ? 'disabled' : ''} onclick="buyPotion('${potion.type}')"
        style="padding: 0.8em 1.5em; background: ${isActive ? '#666' : canAfford ? '#8e44ad' : '#666'}; color: #fff;">
        ${isActive ? 'Active' : canAfford ? 'Buy' : 'Need coins'}
      </button>
    `;
    container.appendChild(div);
  });

  restoreCardFocus(container, restoreIdx);
}

setInterval(() => { if (isSectionActive('potions')) updatePotionsTab(); }, 1000);

function getChumCost(tier) {
  return Math.round(tier.cost * getMoneyDiscountMultiplier());
}

window.buyChum = function (id) {
  const tier = CHUM_TIERS.find(c => c.id === id);
  if (!tier) return;
  const cost = getChumCost(tier);
  if (gameState.coins < cost) { showNotification('Not enough coins!'); return; }

  gameState.coins -= cost;
  gameState.totalSpent += cost;
  gameState.chumBoost = { value: tier.luckBonus, remaining: tier.uses };

  showNotification(`${tier.name} bought! +${(tier.luckBonus * 100).toFixed(0)}% luck for your next ${tier.uses} catches.`);
  updateAllUI();
  updateChumTab();
  saveState();
  checkAchievements();
};

function updateChumTab() {
  const container = document.getElementById('chum-list');
  if (!container) return;

  const restoreIdx = captureCardFocusIndex(container);
  container.innerHTML = '';
  CHUM_TIERS.forEach((tier, i) => {
    const cost = getChumCost(tier);
    const canAfford = gameState.coins >= cost;
    const isActiveTier = gameState.chumBoost && gameState.chumBoost.value === tier.luckBonus && gameState.chumBoost.remaining > 0;

    const filterByTier = [
      '',
      'filter: hue-rotate(25deg) saturate(1.3) brightness(1.05);',
      'filter: hue-rotate(280deg) saturate(1.6) brightness(1.1) drop-shadow(0 0 4px #b06fe0);'
    ];

    const div = document.createElement('div');
    div.style.cssText = `
      background: rgba(0,0,0,0.3); padding: 1.5em; border-radius: 8px;
      border: 2px solid ${isActiveTier ? '#23d160' : canAfford ? '#8e44ad' : '#666'};
      margin-bottom: 1em; display: flex; justify-content: space-between; align-items: center; gap: 1em; flex-wrap: wrap;
    `;

    let statusLine = '';
    if (isActiveTier) {
      statusLine = `<div style="color: #23d160; font-size: 0.85em; margin-top: 0.3em;">Active: ${gameState.chumBoost.remaining} catches left</div>`;
    }

    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1em; flex: 1 1 280px; min-width: 0;">
        <img src="assets/items/chum.png" alt="" style="width: 40px; height: 40px; image-rendering: pixelated; object-fit: contain; flex-shrink: 0; ${filterByTier[i]}">
        <div style="min-width: 0;">
          <div style="font-size: 1.2em; margin-bottom: 0.3em;">${tier.name}</div>
          <div style="color: #b9c2de; font-size: 0.85em; margin-bottom: 0.5em;">+${(tier.luckBonus * 100).toFixed(0)}% Luck for your next ${tier.uses} catches</div>
          <div style="color: #ffd700; font-size: 0.9em; display: flex; align-items: center; gap: 0.3em;">
            Cost: <img src="assets/icons/currency/coin.png" alt="" class="currency-icon"> ${formatNumber(cost)}
          </div>
          ${statusLine}
        </div>
      </div>
      <button class="pixel-btn" ${!canAfford ? 'disabled' : ''} onclick="buyChum('${tier.id}')"
        style="padding: 0.8em 1.5em; background: ${canAfford ? '#8e44ad' : '#666'}; color: #fff; margin-left: auto;">
        ${canAfford ? 'Buy' : 'Need coins'}
      </button>
    `;

    div.querySelector('button').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!e.repeat) return;
      e.preventDefault();
    });

    container.appendChild(div);
  });

  restoreCardFocus(container, restoreIdx);
}

setInterval(() => { if (isSectionActive('potions')) updateChumTab(); }, 1000);

function setupInventoryFilters() {
  const searchInput = document.getElementById('fish-search');
  const searchBtn = document.getElementById('search-btn');
  const resetBtn = document.getElementById('reset-filters-btn');
  const shinyFilter = document.getElementById('shiny-filter');

  if (searchBtn) searchBtn.addEventListener('click', () => updateInventoryTab());
  if (searchInput) searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') updateInventoryTab(); });
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('.rarity-filter').forEach(f => { f.checked = false; });
      if (shinyFilter) shinyFilter.checked = false;
      updateInventoryTab();
    });
  }
  document.querySelectorAll('.rarity-filter').forEach(f => f.addEventListener('change', () => updateInventoryTab()));
  if (shinyFilter) shinyFilter.addEventListener('change', () => updateInventoryTab());
}

function updateAutoSellLockState() {
  const select = document.getElementById('auto-sell-select');
  const hint = document.getElementById('auto-sell-lock-hint');
  if (!select) return;

  const unlocked = hasSkillEffect('unlockAutoSell');
  select.disabled = !unlocked;
  select.style.opacity = unlocked ? '1' : '0.5';
  select.style.cursor = unlocked ? '' : 'not-allowed';
  select.title = unlocked ? '' : 'Locked: buy "Sell the Catch" in the Skill Tree\'s Money branch to unlock auto-sell.';
  if (hint) hint.style.display = unlocked ? 'none' : 'block';
}

function updateAutoSellWeightRow() {
  const settingsPanel = document.getElementById('settings-panel');
  if (!settingsPanel) return;

  const unlocked = hasSkillEffect('unlockAutoSellWeight');
  let row = document.getElementById('auto-sell-weight-row');

  if (!unlocked) {
    if (row) row.remove();
    return;
  }

  const ceiling = getSkillEffectSum('autoSellWeightCeiling');
  if (!row) {
    row = document.createElement('div');
    row.id = 'auto-sell-weight-row';
    row.className = 'settings-row';
    row.innerHTML = `
      <label for="auto-sell-weight-input" style="color:#00bcd4; font-family:'Press Start 2P',Arial,sans-serif; font-size:0.85em;">Sell under (lb)</label>
      <input id="auto-sell-weight-input" type="number" min="0" step="0.1" style="flex:1; padding:0.4em; background:#181c24; color:#fff; border:2px solid #00bcd4; font-family:'Press Start 2P',Arial,sans-serif; font-size:0.75em;">
    `;
    const autoSellRow = document.getElementById('auto-sell-row');
    if (autoSellRow) autoSellRow.insertAdjacentElement('afterend', row);
    else settingsPanel.insertBefore(row, settingsPanel.firstChild);

    const input = row.querySelector('#auto-sell-weight-input');
    input.addEventListener('change', () => {
      const raw = parseFloat(input.value);
      const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(raw, getSkillEffectSum('autoSellWeightCeiling'))) : null;
      gameState.autoSellMaxWeight = clamped;
      input.value = clamped === null ? '' : clamped;
      saveState();
    });
  }

  const input = row.querySelector('#auto-sell-weight-input');
  input.max = ceiling;
  if (document.activeElement !== input) {
    input.value = gameState.autoSellMaxWeight === null ? '' : gameState.autoSellMaxWeight;
  }
}

function openSettingsPanel() {
  const settingsPanel = document.getElementById('settings-panel');
  if (!settingsPanel) return;
  settingsPanel.style.display = 'block';
  settingsPanel.focus();
}

function closeSettingsPanel() {
  const settingsPanel = document.getElementById('settings-panel');
  if (!settingsPanel) return;
  settingsPanel.style.display = 'none';
  document.getElementById('settings-btn')?.focus();
}

function isSettingsPanelOpen() {
  const settingsPanel = document.getElementById('settings-panel');
  return !!settingsPanel && settingsPanel.style.display === 'block';
}

function setupSettings() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const closeSettingsBtn = document.getElementById('close-settings-btn');

  if (settingsBtn && settingsPanel) settingsBtn.addEventListener('click', openSettingsPanel);
  if (closeSettingsBtn && settingsPanel) closeSettingsBtn.addEventListener('click', closeSettingsPanel);

  if (settingsPanel && !document.getElementById('auto-sell-row')) {
    const row = document.createElement('div');
    row.id = 'auto-sell-row';
    row.className = 'settings-row';
    row.innerHTML = `
      <div style="flex:1;">
        <div style="display:flex; align-items:center; gap:1em;">
          <label for="auto-sell-select" style="color:#00bcd4; font-family:'Press Start 2P',Arial,sans-serif; font-size:0.85em; flex-shrink:0;">Auto-sell</label>
          <select id="auto-sell-select" style="flex:1; padding:0.4em; background:#181c24; color:#fff; border:2px solid #00bcd4; font-family:'Press Start 2P',Arial,sans-serif; font-size:0.75em;">
            <option value="none">Off</option>
            <option value="Common">Common & below</option>
            <option value="Rare">Rare & below</option>
            <option value="Epic">Epic & below</option>
          </select>
        </div>
        <div id="auto-sell-lock-hint" style="display:none; margin-top:0.5em; color:#b9c2de; font-size:0.68em; line-height:1.4;"><i class="fa-solid fa-lock" aria-hidden="true"></i> Buy "Sell the Catch" in the Skill Tree's Money branch to unlock.</div>
      </div>
    `;
    settingsPanel.insertBefore(row, settingsPanel.querySelector('.settings-credits') || null);

    const select = row.querySelector('#auto-sell-select');
    select.value = gameState.autoSellRarity;
    select.addEventListener('change', () => {
      if (select.disabled) return;
      gameState.autoSellRarity = select.value;
      saveState();
    });
    updateAutoSellLockState();
  }

}

function syncRailScrollHints() {
  const rail = document.getElementById('icon-rail');
  if (!rail) return;
  const maxScroll = rail.scrollWidth - rail.clientWidth;
  rail.toggleAttribute('data-more-left', maxScroll > 2 && rail.scrollLeft > 2);
  rail.toggleAttribute('data-more-right', maxScroll > 2 && rail.scrollLeft < maxScroll - 2);
}

function setupRailScrollHints() {
  const rail = document.getElementById('icon-rail');
  if (!rail) return;
  rail.addEventListener('scroll', syncRailScrollHints, { passive: true });
  window.addEventListener('resize', syncRailScrollHints);
  document.fonts?.ready?.then(syncRailScrollHints);
  document.querySelectorAll('.rail-scroll-hint').forEach(hint => {
    const dir = hint.classList.contains('rail-scroll-hint-left') ? -1 : 1;
    hint.addEventListener('click', () => rail.scrollBy({ left: dir * rail.clientWidth * 0.6, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
  });
  syncRailScrollHints();
}

document.addEventListener('DOMContentLoaded', () => {
  setupRailScrollHints();
  loadState();
  getRevealDecoyPool();

  let fishBtnContainer = document.getElementById('fish-btn-container');
  if (!fishBtnContainer) {
    fishBtnContainer = document.createElement('div');
    fishBtnContainer.id = 'fish-btn-container';
    document.body.appendChild(fishBtnContainer);
  }

  if (!elements.fishBtn) {
    elements.fishBtn = document.createElement('button');
    elements.fishBtn.id = 'fish-btn';
    elements.fishBtn.className = 'pixel-btn';
    elements.fishBtn.textContent = 'Fish!';
    elements.fishBtn.addEventListener('click', startFishing);
    fishBtnContainer.appendChild(elements.fishBtn);
    const waitHint = document.createElement('div');
    waitHint.id = 'fish-wait-hint';
    waitHint.setAttribute('role', 'status');
    waitHint.hidden = true;
    fishBtnContainer.appendChild(waitHint);
    fishBtnContainer.addEventListener('click', (e) => {
      const btn = elements.fishBtn;
      if (e.target !== fishBtnContainer || !btn.disabled || btn.style.display === 'none') return;
      const r = btn.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) showFishWaitHint();
    });
  }

  if (gameState.autoFishUnlocked && !elements.autoFishBtn) {
    elements.autoFishBtn = document.createElement('button');
    elements.autoFishBtn.id = 'auto-fish-btn';
    elements.autoFishBtn.className = 'pixel-btn';
    elements.autoFishBtn.textContent = 'Auto Fish';
    elements.autoFishBtn.addEventListener('click', toggleAutoFish);
    fishBtnContainer.appendChild(elements.autoFishBtn);
  }

  setupSettings();
  setupInventoryFilters();
  setupSkillTreeMapPanning();
  setupSkillConfirm();
  initAudio();
  updateAllUI();
  updatePotionsTab();
  updateChumTab();
  checkAchievements();
});

const SKILLTREE_DRAG_THRESHOLD_PX = 6;
function setupSkillTreeMapPanning() {
  const map = document.getElementById('skilltree-map');
  if (!map) return;

  let panning = false;
  let dragged = false;
  let startX = 0, startY = 0, startScrollLeft = 0, startScrollTop = 0;

  map.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    panning = true;
    dragged = false;
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = map.scrollLeft;
    startScrollTop = map.scrollTop;
  });

  map.addEventListener('pointermove', (e) => {
    if (!panning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragged && Math.hypot(dx, dy) > SKILLTREE_DRAG_THRESHOLD_PX) {
      dragged = true;
      map.classList.add('panning');
      map.setPointerCapture(e.pointerId);
      hideSkillTooltip();
    }
    if (dragged) {
      map.scrollLeft = startScrollLeft - dx;
      map.scrollTop = startScrollTop - dy;
      e.preventDefault();
    }
  });

  const endPan = (e) => {
    if (!panning) return;
    panning = false;
    map.classList.remove('panning');
    if (map.hasPointerCapture?.(e.pointerId)) map.releasePointerCapture(e.pointerId);
  };
  map.addEventListener('pointerup', endPan);
  map.addEventListener('pointercancel', endPan);

  map.addEventListener('click', (e) => {
    if (dragged) {
      e.stopPropagation();
      e.preventDefault();
      dragged = false;
    }
  }, true);
}

const LOADING_SAFETY_TIMEOUT_MS = 15000;

function buildPreloadImageList() {
  const paths = [
    'assets/icons/currency/coin.png', 'assets/icons/currency/pearl.png',
    'assets/items/chum.png', 'assets/background/background.png',
    ...['smallchest.png', 'bigchest.png', 'sunkenchest.png', 'bosschest.png'].map(n => `assets/chests/${n}`),
  ];
  new Set(fishCatalogue.map(f => f.image)).forEach(n => paths.push(`assets/fish/${n}`));
  new Set(junkCatalogue.map(j => j.image)).forEach(n => paths.push(`assets/junk/${n}`));
  new Set(relicShards.map(r => r.image)).forEach(n => paths.push(`assets/relics/${n}`));
  const skillIconNames = new Set(Object.values(BRANCH_ICON_CLASS));
  skillTreeNodes.forEach(node => { if (node.icon) skillIconNames.add(node.icon); });
  skillIconNames.forEach(name => paths.push(`assets/icons/skills/${name}.png`));
  ['fishing', 'inventory', 'index', 'upgrade', 'locations', 'skilltree', 'potions', 'crates', 'relics', 'mastery', 'rebirth', 'settings']
    .forEach(name => paths.push(`assets/icons/nav/${name}.png`));
  ['clover', 'crown', 'lock', 'trophy', 'waves', 'fish', 'coin', 'pin', 'lightning', 'sleep', 'moon', 'weight', 'trash', 'star', 'hourglass', 'bag', 'arrow-up', 'save']
    .forEach(name => paths.push(`assets/icons/ui/${name}.png`));
  ['rod-1', 'rod-2', 'rod-3', 'rod-4', 'rod-auto', 'hook-0', 'hook-1', 'potion-luck', 'potion-speed']
    .forEach(name => paths.push(`assets/icons/shop/${name}.png`));
  return paths;
}

function preloadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = src;
  });
}

function preloadVideo(videoEl) {
  return new Promise(resolve => {
    if (!videoEl || videoEl.readyState >= 3) { resolve(); return; }
    const done = () => resolve();
    videoEl.addEventListener('canplaythrough', done, { once: true });
    videoEl.addEventListener('error', done, { once: true });
  });
}

function preloadFonts() {
  if (!('fonts' in document)) return Promise.resolve();
  return document.fonts.ready.catch(() => {});
}

function initLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (!screen) return;

  const fill = document.getElementById('loading-bar-fill');
  const percentEl = document.getElementById('loading-percent');
  const images = buildPreloadImageList();
  const videoEl = document.querySelector('.bg-video');

  const total = images.length + 2;
  let completed = 0;
  const bump = () => {
    completed++;
    const pct = Math.min(100, Math.round((completed / total) * 100));
    if (fill) fill.style.width = `${pct}%`;
    if (percentEl) percentEl.textContent = `${pct}%`;
  };

  const tasks = [
    ...images.map(src => preloadImage(src).then(bump)),
    preloadVideo(videoEl).then(bump),
    preloadFonts().then(bump)
  ];
  const safetyNet = new Promise(resolve => setTimeout(resolve, LOADING_SAFETY_TIMEOUT_MS));

  Promise.race([Promise.all(tasks), safetyNet]).then(() => {
    if (fill) fill.style.width = '100%';
    if (percentEl) percentEl.textContent = '100%';
    screen.classList.add('hidden');
    setTimeout(() => screen.remove(), 600);
    loadSfxBuffers();
    loadRevealFx();
  });
}

document.addEventListener('DOMContentLoaded', initLoadingScreen);

export const __testHooks__ = {
  SAVE_KEY, SAVE_BACKUP_KEY, SAVE_VERSION, rollCatch, grantCatch, levelUpIfReady, addFishToInventory, getSellValue,
  applyOfflineProgress, migrateLegacySave, formatNumber, formatWeight,
  handleVisibilityChange, OFFLINE_MAX_MS, getHiddenSince: () => hiddenSince,
  getCurrentBait, getAvailableRaritiesForTier, checkAchievements,
  saveState, loadState, updateAllUI, getTotalLuck, getReelSpeedBonus, getCastTimeMs, isChestBuffActive,
  isPotionActive,
  getKnownSaveRevision: () => knownSaveRevision,
  setLoadRenderer,
  getCurrentLocation, ACHIEVEMENTS, getRenownCost, getRenownMultiplier, recordDiscovery,
  CHUM_TIERS, updateChumTab, updateUpgradesTab, getChumCost,
  JUNK_CHANCE, getJunkChance, getIdleEfficiencyCost, getOfflineIntervalMs, getOfflineMaxCatches,
  getInventoryCap, getCappedInventoryCount, getStreakMultiplier, getStreakDecayThresholdMs,
  registerManualCast, getRevealDurationMs,
  AUTO_FISH_UNLOCK_LEVEL, TRIPLE_HOOK_CONFIG, getRollCount,
  getAutoFishBurstSeconds, getAutoFishCadenceMs, getAutoFishRevealDurationMs, AUTO_FISH_REVEAL_MULTIPLIER, REVEAL_LEGENDARY_MIN_MS,
  startAutoFish, stopAutoFish, getAutoFishHandles: () => [autoFishInterval, autoFishCountdown],
  autoCatchFish, revealState, beginReveal, skipReveal, finalizeReveal,
  skillTreeNodes, getNodeById, getNodeStatus, canAffordNode,
  purchaseSkillNode, getSkillNodeLevel, getSkillNodeCost, formatSkillCost, getSkillEffectSum, hasSkillEffect,
  triggerScriptedFirstCatch, togglePin, openChest, getMoneyDiscountMultiplier, getPearlGainMultiplier,
  performRebirth, canRebirth, getRebirthBonus, getRebirthCostMultiplier, getScaledCost, getRebirthPointsAward,
  respecSkillTree, getRebirthPointsSpentOnNode, RESPEC_COST_REBIRTH_POINTS,
  isTutorialActive, startTutorialIfNeeded, handleTutorialCatchResolved, handleTutorialNodePurchased,
  updateTutorialBanner, switchToTab, TUTORIAL_ALLOWED_TABS, TUTORIAL_STEPS, TUTORIAL_MIN_FISH, advanceTutorial, getTutorialTarget, tutorialNotify,
  syncTutorialInputLock,
  isPreRevealRoll, sellFish, sellAll, SFX, getRarityWeights, formatShortNumber, formatSkillCostShortHtml,
  getSfxDispatchLog: () => [...sfxDispatchLog],
  resetSfxState: () => { sfxDispatchLog.length = 0; sfxQueue.length = 0; Object.keys(sfxLastAt).forEach(k => delete sfxLastAt[k]); }
};

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const t = e.target;
  if (t && typeof t.closest === 'function' &&
      t.closest('button, a[href], input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')) return;
  e.preventDefault();
  if (e.repeat) return;
  if (getOpenOverlay()) return;
  if (isTutorialActive() && getTutorialStep()?.tab !== 'fishing') return;
  const fishBtn = document.getElementById('fish-btn');
  const activeTab = document.querySelector('.tab-content.active');
  if (fishBtn && !fishBtn.disabled && activeTab && activeTab.id === 'fishing') fishBtn.click();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.repeat) return;
  const t = e.target;
  if (t && typeof t.closest === 'function' && t.closest('#fish-btn')) e.preventDefault();
});

function getOpenOverlay() {
  if (isSkillConfirmOpen()) return 'skill-confirm';
  if (isSettingsPanelOpen()) return 'settings';
  if (document.getElementById('offline-modal-overlay')) return 'offline';
  const skilltree = document.getElementById('skilltree');
  if (skilltree && skilltree.classList.contains('active')) return 'skilltree';
  return null;
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const overlay = getOpenOverlay();
  if (overlay === 'skill-confirm') { closeSkillPurchaseConfirm(); return; }
  if (overlay === 'settings') { closeSettingsPanel(); return; }
  if (overlay === 'offline') {
    document.getElementById('offline-modal-close')?.click();
    return;
  }
  if (overlay === 'skilltree') closeSkillTreeModal();
});

const OVERLAY_LAYER_SELECTOR = {
  'skill-confirm': '#skill-confirm-overlay',
  settings: '#settings-panel',
  offline: '#offline-modal-overlay',
  skilltree: '#skilltree'
};

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const overlay = getOpenOverlay();
  const layer = overlay && document.querySelector(OVERLAY_LAYER_SELECTOR[overlay]);
  if (!layer) return;
  const focusables = [...layer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && !el.inert && el.getClientRects().length > 0);
  if (!focusables.length) { e.preventDefault(); layer.focus(); return; }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (!layer.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && (active === first || active === layer)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
});
