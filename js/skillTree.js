const DIRS = {
  luck: { x: -1, y: 0 },
  money: { x: 1, y: 0 },
  speed: { x: 0, y: 1 },
  storage: { x: 0, y: -1 }
};

function pos(branch, depth, lateral) {
  const dir = DIRS[branch];
  const perp = { x: -dir.y, y: dir.x };
  const step = 160;
  const lateralStep = 190;
  return {
    x: Math.round(dir.x * depth * step + perp.x * lateral * lateralStep),
    y: Math.round(dir.y * depth * step + perp.y * lateral * lateralStep)
  };
}

function chain(branch, subPath, lateral, rootId, startDepth, entries) {
  const nodes = [];
  let prereq = rootId;
  entries.forEach((e, i) => {
    const id = `${branch}-${subPath}-${i + 1}`;
    nodes.push({
      id,
      branch,
      subPath,
      position: pos(branch, startDepth + i, lateral),
      tier: e.tier || 'permanent',
      cost: e.cost,
      prerequisiteId: prereq,
      icon: e.icon || branch,
      name: e.name,
      description: e.description,
      effect: e.effect
    });
    prereq = id;
  });
  return { nodes, lastId: prereq };
}

const nodes = [];

nodes.push({
  id: 'start',
  branch: 'center',
  subPath: null,
  position: { x: 0, y: 0 },
  tier: 'permanent',
  cost: { rebirthPoints: 1 },
  prerequisiteId: null,
  icon: 'compass',
  name: 'First Cast',
  description: 'A tiny, real step toward every direction on the map. Unlocks the rest of the tree.',
  effect: { type: 'luckFlat', value: 0.001 }
});

nodes.push({
  id: 'luck-root', branch: 'luck', subPath: null, position: pos('luck', 1, 0),
  tier: 'permanent', cost: { rebirthPoints: 2 }, prerequisiteId: 'start',
  icon: 'clover', name: 'A Sharper Eye', description: 'Opens three ways to get luckier: avoiding junk, finding shinies, and sensing relics.',
  effect: { type: 'luckFlat', value: 0.005 }
});

{
  const { nodes: junkChain, lastId: junkEnd } = chain('luck', 'junk', -1.4, 'luck-root', 3, [
    { name: 'Steady Hands I', icon: 'broom', description: 'Slightly less junk turns up on a cast.', effect: { type: 'junkAvoidPercent', value: 0.05 }, cost: { rebirthPoints: 2 } },
    { name: 'Steady Hands II', icon: 'broom', description: 'Junk shows up a little less often still.', effect: { type: 'junkAvoidPercent', value: 0.07 }, cost: { rebirthPoints: 4, coins: 15000 } },
    { name: 'Steady Hands III', icon: 'broom', description: 'The last stretch of junk-avoidance - mostly real catches from here.', effect: { type: 'junkAvoidPercent', value: 0.08 }, cost: { rebirthPoints: 6, coins: 40000 } }
  ]);
  const { nodes: pityChain } = chain('luck', 'pity', -1.4, junkEnd, 6, [
    { name: 'Glimmer Sense I', icon: 'star', description: 'Every catch gains a permanent +0.25% chance to come up shiny.', effect: { type: 'earlyShinyChance', value: 0.0025 }, cost: { rebirthPoints: 5, coins: 30000 } },
    { name: 'Glimmer Sense II', icon: 'star', description: 'That permanent shiny chance grows by another +0.50%.', effect: { type: 'earlyShinyChance', value: 0.005 }, cost: { rebirthPoints: 8, coins: 80000, pearls: 50 } }
  ]);
  nodes.push(...junkChain, ...pityChain);
}

{
  const { nodes: shinyChain, lastId: shinyEnd } = chain('luck', 'shiny', 0, 'luck-root', 3, [
    { name: 'Glint in the Water I', icon: 'sparkles', description: 'A small chance for a catch to come up shiny outright, no pity needed.', effect: { type: 'earlyShinyChance', value: 0.002 }, cost: { rebirthPoints: 2 } },
    { name: 'Glint in the Water II', icon: 'sparkles', description: 'That early-shiny chance climbs further.', effect: { type: 'earlyShinyChance', value: 0.003 }, cost: { rebirthPoints: 4, coins: 15000 } },
    { name: 'Glint in the Water III', icon: 'sparkles', description: 'Shinies become a real, standing possibility on every cast.', effect: { type: 'earlyShinyChance', value: 0.005 }, cost: { rebirthPoints: 6, coins: 40000 } }
  ]);
  const { nodes: weightChain } = chain('luck', 'weight', 0, shinyEnd, 6, [
    { name: 'A Feel for Big Ones I', icon: 'kettlebell', description: 'Catches skew a little toward the heavier end of their weight range.', effect: { type: 'weightRangeBias', value: 0.15 }, cost: { rebirthPoints: 5, coins: 30000 } },
    { name: 'A Feel for Big Ones II', icon: 'kettlebell', description: 'That skew toward heavier catches grows further.', effect: { type: 'weightRangeBias', value: 0.20 }, cost: { rebirthPoints: 8, coins: 80000, pearls: 50 } }
  ]);
  nodes.push(...shinyChain, ...weightChain);
}

{
  const { nodes: relicChain, lastId: relicEnd } = chain('luck', 'relic', 1.4, 'luck-root', 3, [
    { name: 'Tideheart Sense I', icon: 'amulet', description: 'Relic shards turn up a little more often.', effect: { type: 'relicFindRatePercent', value: 0.15 }, cost: { rebirthPoints: 3 } },
    { name: 'Tideheart Sense II', icon: 'amulet', description: 'The pull toward relics grows stronger.', effect: { type: 'relicFindRatePercent', value: 0.20 }, cost: { rebirthPoints: 5, coins: 25000 } },
    { name: 'Tideheart Sense III', icon: 'amulet', description: 'As attuned to the Tideheart as the tree can make you, before it goes uncapped.', effect: { type: 'relicFindRatePercent', value: 0.25 }, cost: { rebirthPoints: 7, coins: 60000, pearls: 40 } }
  ]);
  nodes.push(...relicChain);

  nodes.push({
    id: 'luck-infinite', branch: 'luck', subPath: 'infinite', position: pos('luck', 6, 1.4),
    tier: 'cycle', cost: { rebirthPoints: 10, coins: 150000, pearls: 100 }, prerequisiteId: relicEnd,
    icon: 'infinity', name: 'Fortune, Uncapped', description: 'Every level pushes Luck further - no ceiling, ever. Repeatable.',
    effect: { type: 'luckPercent', value: 0.02 }
  });
}

nodes.push({
  id: 'money-root', branch: 'money', subPath: null, position: pos('money', 1, 0),
  tier: 'permanent', cost: { rebirthPoints: 2 }, prerequisiteId: 'start',
  icon: 'coin-purse', name: 'A Head for Coin', description: 'Opens four ways to make coins work harder: cheaper gear, richer chests, steadier income, and smarter auto-sell.',
  effect: { type: 'moneyDiscountPercent', value: 0.02 }
});

{
  const { nodes: discountChain } = chain('money', 'discount', -1.6, 'money-root', 3, [
    { name: 'Fair Prices I', icon: 'price-tag', description: 'Rod, Luck, Chum, and Idle Efficiency cost a little less.', effect: { type: 'moneyDiscountPercent', value: 0.04 }, cost: { rebirthPoints: 2 } },
    { name: 'Fair Prices II', icon: 'price-tag', description: 'The discount on every other system deepens.', effect: { type: 'moneyDiscountPercent', value: 0.05 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Fair Prices III', icon: 'price-tag', description: 'As good a rate as the tree can strike, before Renown takes over.', effect: { type: 'moneyDiscountPercent', value: 0.06 }, cost: { rebirthPoints: 6, coins: 50000 } }
  ]);
  nodes.push(...discountChain);
}

{
  const { nodes: valueChain } = chain('money', 'value', -0.55, 'money-root', 3, [
    { name: 'Richer Hauls I', icon: 'chest', description: 'Chests pay out more Pearls on average.', effect: { type: 'pearlGainPercent', value: 0.10 }, cost: { rebirthPoints: 2 } },
    { name: 'Richer Hauls II', icon: 'chest', description: 'Chest Pearl rewards climb further.', effect: { type: 'pearlGainPercent', value: 0.12 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Richer Hauls III', icon: 'chest', description: 'Chests become a genuinely reliable Pearl source.', effect: { type: 'pearlGainPercent', value: 0.15 }, cost: { rebirthPoints: 6, coins: 50000, pearls: 30 } }
  ]);
  nodes.push(...valueChain);
}

let moneyIncomeEnd;
{
  const { nodes: incomeChain, lastId } = chain('money', 'income', 0.55, 'money-root', 3, [
    { name: 'Steady Trade I', icon: 'chart', description: 'Every catch pays a little more in coins.', effect: { type: 'coinIncomePercent', value: 0.03 }, cost: { rebirthPoints: 2 } },
    { name: 'Steady Trade II', icon: 'chart', description: 'That per-catch bonus grows further.', effect: { type: 'coinIncomePercent', value: 0.04 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Steady Trade III', icon: 'chart', description: 'The last finite step before Renown becomes the real coin engine.', effect: { type: 'coinIncomePercent', value: 0.05 }, cost: { rebirthPoints: 6, coins: 50000 } }
  ]);
  nodes.push(...incomeChain);
  moneyIncomeEnd = lastId;
}

{
  // Standalone (not chain()'s first entry) so its id money-autosell-0 can't collide with chain ids money-autosell-1/2/3 — older saves rely on them.
  nodes.push({
    id: 'money-autosell-0', branch: 'money', subPath: 'autosell', position: pos('money', 3, 1.6),
    tier: 'permanent', cost: { rebirthPoints: 2 }, prerequisiteId: 'money-root',
    icon: 'shopping-cart', name: 'Sell the Catch', description: 'Unlocks auto-sell by rarity (set in Settings) - every catch at or below the chosen rarity sells itself automatically.',
    effect: { type: 'unlockAutoSell', value: true }
  });

  const { nodes: autoSellChain } = chain('money', 'autosell', 1.6, 'money-autosell-0', 4, [
    { name: 'Sell by Weight I', icon: 'scales', description: 'Unlocks a weight-based auto-sell rule alongside the existing rarity one.', effect: { type: 'unlockAutoSellWeight', value: true }, cost: { rebirthPoints: 2 } },
    { name: 'Sell by Weight II', icon: 'scales', description: 'The weight-based auto-sell rule can be set higher.', effect: { type: 'autoSellWeightCeiling', value: 5 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Sell by Weight III', icon: 'scales', description: 'Combine rarity and weight rules freely - auto-sell finally covers the odd cases.', effect: { type: 'autoSellWeightCeiling', value: 10 }, cost: { rebirthPoints: 6, coins: 50000 } }
  ]);
  nodes.push(...autoSellChain);
}

nodes.push({
  id: 'money-renown', branch: 'money', subPath: 'renown', position: pos('money', 6, 0.55),
  tier: 'permanent', cost: { rebirthPoints: 10, coins: 150000, pearls: 100 }, prerequisiteId: moneyIncomeEnd,
  icon: 'crown', name: "Angler's Renown", description: 'Unlocks Renown - a repeatable coin-value multiplier with nowhere near a ceiling.',
  effect: { type: 'unlockRenown', value: true }
});

nodes.push({
  id: 'speed-root', branch: 'speed', subPath: null, position: pos('speed', 1, 0),
  tier: 'permanent', cost: { rebirthPoints: 2 }, prerequisiteId: 'start',
  icon: 'bolt', name: 'Faster Hands', description: 'Opens six ways to spend less time waiting: offline gains, Auto Fish, streak patience, the reveal reel, and Triple Hook.',
  effect: { type: 'revealSpeedFlatMs', value: 150 }
});

{
  const { nodes: idleChain } = chain('speed', 'idle', -1.6, 'speed-root', 3, [
    { name: 'Unlock: Idle Efficiency', icon: 'moon', description: 'Unlocks the Idle Efficiency upgrade in the Upgrades tab (repeatable, coin-purchased from here on).', effect: { type: 'unlockIdleEfficiency', value: true }, cost: { rebirthPoints: 2 } },
    { name: 'Patient Waters I', icon: 'moon', description: 'Offline catches resolve a little faster even before buying Idle Efficiency levels.', effect: { type: 'offlineIntervalPercent', value: 0.05 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Patient Waters II', icon: 'moon', description: 'Offline progress keeps pace even better while you\'re away.', effect: { type: 'offlineIntervalPercent', value: 0.05 }, cost: { rebirthPoints: 6, coins: 50000 } }
  ]);
  nodes.push(...idleChain);
}

{
  const { nodes: burstChain } = chain('speed', 'autofish-burst', -0.55, 'speed-root', 3, [
    { name: 'Longer Bursts I', icon: 'fire', description: 'Each Auto Fish session runs a little longer before it needs restarting.', effect: { type: 'autoFishBurstSeconds', value: 10 }, cost: { rebirthPoints: 2 } },
    { name: 'Longer Bursts II', icon: 'fire', description: 'Auto Fish sessions stretch out further still.', effect: { type: 'autoFishBurstSeconds', value: 15 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Longer Bursts III', icon: 'fire', description: 'Auto Fish can run for most of a sitting on one press.', effect: { type: 'autoFishBurstSeconds', value: 20 }, cost: { rebirthPoints: 6, coins: 50000 } }
  ]);
  nodes.push(...burstChain);
}

{
  const { nodes: cooldownChain } = chain('speed', 'autofish-cooldown', 0.55, 'speed-root', 3, [
    { name: 'Quicker Reels I', icon: 'fishing-rod', description: 'Auto Fish casts a little more often.', effect: { type: 'autoFishCooldownMs', value: 300 }, cost: { rebirthPoints: 2 } },
    { name: 'Quicker Reels II', icon: 'fishing-rod', description: 'Auto Fish\'s cadence tightens further.', effect: { type: 'autoFishCooldownMs', value: 400 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Quicker Reels III', icon: 'fishing-rod', description: 'Auto Fish about as brisk as it can get without becoming manual fishing.', effect: { type: 'autoFishCooldownMs', value: 500 }, cost: { rebirthPoints: 6, coins: 50000 } }
  ]);
  nodes.push(...cooldownChain);
}

{
  const { nodes: streakChain } = chain('speed', 'streak-decay', 1.6, 'speed-root', 3, [
    { name: 'Patient Streak I', icon: 'chain', description: 'A cast streak survives a longer pause before it starts to fade.', effect: { type: 'streakDecayBonusMs', value: 5000 }, cost: { rebirthPoints: 2 } },
    { name: 'Patient Streak II', icon: 'chain', description: 'The streak forgives an even longer break.', effect: { type: 'streakDecayBonusMs', value: 7000 }, cost: { rebirthPoints: 4, coins: 20000 } }
  ]);
  nodes.push(...streakChain);
}

{
  const { nodes: tripleChain } = chain('speed', 'triplehook-reveal', 2.4, 'speed-root', 3, [
    { name: 'Triple Focus I', icon: 'hook', description: 'With Triple Hook owned, its 3-slot reveal resolves a little faster.', effect: { type: 'tripleHookRevealBonusMs', value: 100 }, cost: { rebirthPoints: 3 } },
    { name: 'Triple Focus II', icon: 'hook', description: 'The 3-slot reveal tightens further.', effect: { type: 'tripleHookRevealBonusMs', value: 150 }, cost: { rebirthPoints: 5, coins: 25000 } }
  ]);
  nodes.push(...tripleChain);
}

{
  const { nodes: revealChain } = chain('speed', 'reveal', -2.4, 'speed-root', 3, [
    { name: 'Quick Eye I', icon: 'eye', description: 'The reveal reel settles a little faster on every manual cast.', effect: { type: 'revealSpeedFlatMs', value: 300 }, cost: { rebirthPoints: 2 } },
    { name: 'Quick Eye II', icon: 'eye', description: 'The reel settles faster still.', effect: { type: 'revealSpeedFlatMs', value: 400 }, cost: { rebirthPoints: 4, coins: 20000 } },
    { name: 'Quick Eye III', icon: 'eye', description: 'About as fast as the reel can resolve and still read as a real reveal.', effect: { type: 'revealSpeedFlatMs', value: 500 }, cost: { rebirthPoints: 6, coins: 50000 } }
  ]);
  nodes.push(...revealChain);
}

nodes.push({
  id: 'storage-root', branch: 'storage', subPath: null, position: pos('storage', 1, 0),
  tier: 'permanent', cost: { rebirthPoints: 2 }, prerequisiteId: 'start',
  icon: 'wooden-crate', name: 'More Room', description: 'Opens five ways to make the bag work smarter: more room, sorting, capacity relief, per-rarity space, and pinning.',
  effect: { type: 'bagCapacityFlat', value: 10 }
});

let storageCapEnd;
{
  const { nodes: capChain, lastId } = chain('storage', 'cap', -1.6, 'storage-root', 3, [
    { name: 'Bigger Bag I', icon: 'backpack', description: '+20 bag capacity.', effect: { type: 'bagCapacityFlat', value: 20 }, cost: { rebirthPoints: 2 } },
    { name: 'Bigger Bag II', icon: 'backpack', description: '+30 bag capacity.', effect: { type: 'bagCapacityFlat', value: 30 }, cost: { rebirthPoints: 5, coins: 35000 } },
    { name: 'Bigger Bag III', icon: 'backpack', description: '+40 bag capacity - the last finite step before the soft-cap cushion.', effect: { type: 'bagCapacityFlat', value: 40 }, cost: { rebirthPoints: 8, coins: 90000, pearls: 40 } }
  ]);
  nodes.push(...capChain);
  storageCapEnd = lastId;
}

{
  const { nodes: autosortChain } = chain('storage', 'autosort', -0.55, 'storage-root', 3, [
    { name: 'Tidy Bag', icon: 'sort-funnel', description: 'The Inventory tab sorts by rarity automatically instead of catch order.', effect: { type: 'unlockAutoSort', value: true }, cost: { rebirthPoints: 3 } },
    { name: 'Tidy Bag II', icon: 'sort-funnel', description: 'A well-organized bag finds room for a little more.', effect: { type: 'bagCapacityFlat', value: 10 }, cost: { rebirthPoints: 4, coins: 20000 } }
  ]);
  nodes.push(...autosortChain);
}

{
  const { nodes: reliefChain } = chain('storage', 'relief', 0.55, 'storage-root', 3, [
    { name: 'Breathing Room I', icon: 'wind', description: 'Once the bag is nearly full, auto-sell quietly picks up any catch - not just ones matching the rarity rule.', effect: { type: 'unlockCapacityRelief', value: true }, cost: { rebirthPoints: 3 } },
    { name: 'Breathing Room II', icon: 'wind', description: 'Capacity relief kicks in a little earlier, before things get tight.', effect: { type: 'capacityReliefThresholdPercent', value: 0.05 }, cost: { rebirthPoints: 5, coins: 25000 } }
  ]);
  nodes.push(...reliefChain);
}

{
  const { nodes: rarityChain } = chain('storage', 'rarity', 1.6, 'storage-root', 3, [
    { name: 'Common Overflow', icon: 'barn', description: 'Common-rarity catches get their own separate room and stop counting against the bag cap.', effect: { type: 'unlockCommonOverflow', value: true }, cost: { rebirthPoints: 4, coins: 15000 } },
    { name: 'Rare Overflow', icon: 'barn', description: 'Rare-rarity catches get the same treatment - Common and Rare both stop counting against the bag cap.', effect: { type: 'unlockRareOverflow', value: true }, cost: { rebirthPoints: 6, coins: 35000 } }
  ]);
  nodes.push(...rarityChain);
}

{
  const { nodes: pinChain } = chain('storage', 'pin', 2.4, 'storage-root', 3, [
    { name: 'Keepsake Pin', icon: 'pin', description: 'Pin a catch to protect it from every auto-sell rule, no matter what it matches.', effect: { type: 'unlockPin', value: true }, cost: { rebirthPoints: 3 } },
    { name: 'Keepsake Overflow', icon: 'pin', description: "A pinned catch means enough to keep around that it stops counting against the bag cap too.", effect: { type: 'unlockPinOverflow', value: true }, cost: { rebirthPoints: 5, coins: 25000 } }
  ]);
  nodes.push(...pinChain);
}

nodes.push({
  id: 'storage-softcap', branch: 'storage', subPath: 'softcap', position: pos('storage', 6, -1.6),
  tier: 'cycle', cost: { rebirthPoints: 10, coins: 150000, pearls: 100 }, prerequisiteId: storageCapEnd,
  icon: 'bedroll', name: 'Overflow Cushion', description: 'A small extra cushion above the bag cap, every level. Repeatable, no ceiling.',
  effect: { type: 'bagCapacityFlat', value: 5 }
});

export const skillTreeNodes = nodes;

export function getNodeById(id) {
  return skillTreeNodes.find(n => n.id === id);
}

export function getNodeStatus(node, unlockedSet) {
  const owned = !!unlockedSet[node.id];
  if (owned) return 'owned';
  const prereqMet = !node.prerequisiteId || !!unlockedSet[node.prerequisiteId];
  return prereqMet ? 'interactable' : 'silhouette';
}

export function canAffordNode(node, wallet) {
  const cost = node.cost || {};
  if (cost.rebirthPoints && (wallet.rebirthPoints || 0) < cost.rebirthPoints) return false;
  if (cost.coins && (wallet.coins || 0) < cost.coins) return false;
  if (cost.pearls && (wallet.pearls || 0) < cost.pearls) return false;
  return true;
}
