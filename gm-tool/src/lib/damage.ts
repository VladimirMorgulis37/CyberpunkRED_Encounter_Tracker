import type { DamageType, CoverType, DamageCalculation } from '@/types';

/**
 * Get cover SP value per Cyberpunk RED RAW
 */
export function getCoverSP(coverType: CoverType): number {
  switch (coverType) {
    case 'light': return 10;
    case 'medium': return 15;
    case 'heavy': return 20;
    case 'human-shield': return 0; // Human shields provide no SP
    default: return 0;
  }
}

/**
 * Get cover HP value
 */
export function getCoverHP(coverType: CoverType): number {
  switch (coverType) {
    case 'light': return 10;
    case 'medium': return 15;
    case 'heavy': return 20;
    case 'human-shield': return 40;
    default: return 0;
  }
}

/**
 * Calculate damage reduction based on damage type
 */
/**
 * Calculate damage reduction based on damage type
 * Per RAW (p. 344), only Melee / Half-Armor halves armor SP.
 * Armor-Piercing (AP) ammo does NOT halve SP; it ablates by 2 SP on penetrating hit.
 */
export function calculateArmorReduction(armorSP: number, damageType: DamageType): number {
  switch (damageType) {
    case 'half-armor':
      return Math.floor(armorSP / 2);
    case 'ignore-armor':
      return 0;
    case 'armor-piercing':
    case 'normal':
    default:
      return armorSP;
  }
}

/**
 * Calculate ablation amount based on damage type
 */
export function getAblationAmount(damageType: DamageType): number {
  return damageType === 'armor-piercing' ? 2 : 1;
}

/**
 * Full damage calculation per Cyberpunk RED RAW
 * Order: Cover SP → Cover HP → Armor SP → HP
 */
export function calculateDamage(
  baseDamage: number,
  armorSP: number,
  damageType: DamageType,
  location: 'head' | 'body',
  isCritical: boolean,
  coverType?: CoverType,
  coverHP?: number,
  shieldSP: number = 0,
  shieldEquipped: boolean = false
): DamageCalculation {
  let remainingDamage = baseDamage;
  let coverDamage = 0;
  let armorAblation = 0;
  let penetration = false;
  
  // Step 1: Apply Cover SP and HP
  let coverSPUsed = 0;
  if (coverType && coverHP && coverHP > 0) {
    const coverSP = getCoverSP(coverType);
    coverSPUsed = coverSP;
    
    // Cover SP reduces damage first
    const afterCoverSP = Math.max(0, remainingDamage - coverSP);
    
    // Remaining damage hits cover HP
    const coverAbsorb = Math.min(afterCoverSP, coverHP);
    coverDamage = coverAbsorb;
    
    // Overflow damage passes through
    remainingDamage = Math.max(0, afterCoverSP - coverAbsorb);
  }
  
  // Step 2: Apply Armor SP for hit location
  let effectiveArmorSP = 0;
  if (remainingDamage > 0 && damageType !== 'ignore-armor') {
    // Add shield SP to body armor if equipped
    let totalArmorSP = armorSP;
    if (location === 'body' && shieldSP > 0 && shieldEquipped) {
      totalArmorSP += shieldSP;
    }
    
    effectiveArmorSP = calculateArmorReduction(totalArmorSP, damageType);
    
    const armorReduction = Math.min(effectiveArmorSP, remainingDamage);
    penetration = remainingDamage > armorReduction;
    remainingDamage -= armorReduction;
    
    // Step 3: Armor Ablation (only if damage penetrated)
    if (penetration) {
      armorAblation = getAblationAmount(damageType);
    }
  }
  
  // Step 4: Apply headshot multiplier (after armor)
  if (location === 'head' && remainingDamage > 0) {
    remainingDamage *= 2;
  }
  
  // Step 5: Add critical damage
  if (isCritical) {
    remainingDamage += 5;
  }
  
  return {
    baseDamage,
    finalDamage: remainingDamage,
    location,
    damageType,
    isCritical,
    armorSP: effectiveArmorSP,
    coverSP: coverSPUsed,
    coverDamage,
    armorAblation,
    hpDamage: remainingDamage,
    penetration
  };
}

/**
 * Get wound state per Cyberpunk RED RAW (Core p. 220)
 * - Lightly Wounded: HP < Max HP, but > 1/2 Max HP (no penalty)
 * - Seriously Wounded: HP <= 1/2 Max HP, but > 0 (-2 to actions & MOVE)
 * - Mortally Wounded / Dead: HP <= 0 (requires Death Saves)
 */
export function getWoundState(hp: number, maxHp: number): 'not-wounded' | 'lightly-wounded' | 'seriously-wounded' | 'mortally-wounded' | 'dead' {
  if (hp <= 0) return 'dead';
  const seriouslyWoundedThreshold = Math.ceil(maxHp / 2);
  if (hp <= seriouslyWoundedThreshold) return 'seriously-wounded';
  if (hp < maxHp) return 'lightly-wounded';
  return 'not-wounded';
}

/**
 * Check if a participant can act based on wound state.
 * In RAW, Seriously Wounded combatants can still act (with -2 penalty).
 * Only dead or downed mortally-wounded participants cannot act normally.
 */
export function canAct(woundState: string): boolean {
  return woundState !== 'dead' && woundState !== 'mortally-wounded';
}

/**
 * Standardized check if a participant is active in combat
 */
export function isCombatantActive(participant: { woundState: string; dead?: boolean; hp: number }): boolean {
  return !participant.dead && participant.hp > 0 && canAct(participant.woundState);
}

/**
 * Format damage calculation for display
 */
export function formatDamageCalculation(calc: DamageCalculation): string {
  const parts: string[] = [];
  
  parts.push(`Base: ${calc.baseDamage}`);
  
  if (calc.coverSP > 0) {
    parts.push(`Cover SP: -${calc.coverSP}`);
    if (calc.coverDamage > 0) {
      parts.push(`Cover HP: -${calc.coverDamage}`);
    }
  }
  
  if (calc.armorSP > 0) {
    parts.push(`Armor: -${calc.armorSP}`);
  }
  
  if (calc.location === 'head') {
    parts.push('Headshot: x2');
  }
  
  if (calc.isCritical) {
    parts.push('Critical: +5');
  }
  
  parts.push(`= ${calc.finalDamage}`);
  
  return parts.join(' → ');
}
