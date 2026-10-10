// Hit feel: how a hit lands, per weapon / attack type. One table (ART_GUIDE.md §8) —
// tune the numbers here, nothing else needs to change.
//
//   hitstop  frames (at 60 fps) the action freezes; only when Anakin deals or takes the hit
//   shake    screen shake in game pixels (decays at 25 px/s); also only around Anakin
//   flash    seconds the hit unit turns white
//   push     a small shove away from the attacker (knockback power) when the attack has none of its own
//   knock    multiplier on the attack's own knockback
export const HITFEEL = {
  saber: { hitstop: 2, shake: 1.5, flash: 0.09, push: 1.4, knock: 1 },
  saberHeavy: { hitstop: 3, shake: 3, flash: 0.11, push: 2.6, knock: 1.2 }, // combo finisher
  saberCrit: { hitstop: 3, shake: 3.5, flash: 0.12, push: 2.2, knock: 1.2 },
  blaster: { hitstop: 0, shake: 1, flash: 0.07, push: 0.8, knock: 1 },
  melee: { hitstop: 2, shake: 2, flash: 0.08, push: 1.2, knock: 1 },
  force: { hitstop: 3, shake: 2.5, flash: 0.1, push: 0, knock: 1 },
  choke: { hitstop: 0, shake: 0, flash: 0.06, push: 0, knock: 0 }, // damage over time: no freeze per tick
  shock: { hitstop: 1, shake: 0.5, flash: 0.08, push: 0.5, knock: 1 },
  explosive: { hitstop: 2, shake: 0, flash: 0.12, push: 0, knock: 1 }, // the explosion shakes on its own
  duel: { hitstop: 3, shake: 3, flash: 0.1, push: 1.5, knock: 1 },
  clash: { hitstop: 3, shake: 2.5, flash: 0, push: 0, knock: 0 }, // blade on blade (no damage)
  deflect: { hitstop: 1, shake: 0.8, flash: 0, push: 0, knock: 0 }, // a bolt turned by the saber
};

const FRAME = 1 / 60;

/** The feel of a damage call: its type, a finisher, a critical hit. */
export function feelFor(opts, crit) {
  if (opts.feel) return HITFEEL[opts.feel];
  if (opts.type === 'saber') return HITFEEL[crit ? 'saberCrit' : opts.heavy ? 'saberHeavy' : 'saber'];
  return HITFEEL[opts.type] || HITFEEL.melee;
}

/** Freeze and shake for a hit that involves the player (`near`). */
export function applyFeel(game, feel, near) {
  if (!feel || !near) return;
  if (feel.hitstop) game.hitstopT = Math.max(game.hitstopT || 0, feel.hitstop * FRAME);
  if (feel.shake) game.fx.shake(feel.shake);
}
