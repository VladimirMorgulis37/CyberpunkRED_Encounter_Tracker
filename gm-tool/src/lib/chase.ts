// Cyberpunk RED Chase System Logic & Algorithms
// Implementation of Core Rulebook (p. 189-192) and Hot Pursuit DLC (May 2024)

import type {
  Vehicle,
  CharacterActor,
  ChaseParticipant,
  ChaseEndReason,
  PositioningChoice,
  PositioningRequirement,
  PositioningResolution,
} from '@/types/chase';
import { rollD10Exploding } from './combatEngine';
import { rollDice } from './dice';

// 2.1. СЛ проверки позиционирования (Конец раунда)
export const POSITIONING_DC_TABLE: Record<number, number> = {
  60: 13,
  40: 15,
  20: 17,
  15: 21,
  10: 24,
  8: 29
};

// Последовательность категорий скорости для деградации при повреждениях
export const SPEED_TIERS: number[] = [60, 40, 20, 15, 10, 8];

// 2.2. Маневры и приемы (Базовые + Hot Pursuit)
export const MANEUVER_DIFFICULTIES = {
  // Hot Pursuit DLC
  NOS_ACTIVATION: 13,     // Автоматически +1 клетка, бросок на контроль
  RAM: 17,                // Попытка тарана в погоне с сохранением контроля
  
  // Core Rulebook (стр. 192)
  HARD_TURN: 13,          // Крутой поворот
  QUICK_STOP: 13,         // Экстренная остановка
  SHARP_MANEUVER: 13,     // Резкий манёвр
  DRIFT: 17,              // Дрифт
  JUMP: 17,               // Прыжок
  AIR_LANDING: 13,        // Экстренная посадка (воздушный транспорт)
  AIR_TRICK: 17           // Фигурный манёвр (воздушный транспорт)
} as const;

export interface ManeuverInfo {
  id: string;
  name: string;
  nameEn: string;
  dc: number;
  description: string;
  vehicleType?: 'ground' | 'air' | 'sea' | 'all';
  actionCost: string;
}

export const MANEUVER_LIST: ManeuverInfo[] = [
  {
    id: 'NOS_ACTIVATION',
    name: 'Активация NOS (Закись азота)',
    nameEn: 'NOS Activation',
    dc: 13,
    description: 'Мгновенно даёт +1 клетку вперёд. Требует бросок Вождения против СЛ 13. При провале ТС выходит из-под контроля!',
    vehicleType: 'all',
    actionCost: 'Стандартное действие'
  },
  {
    id: 'RAM',
    name: 'Таран (Ram)',
    nameEn: 'Ram Maneuver',
    dc: 17,
    description: 'Возможен только при дистанции 0 клеток. Проверка Вождения СЛ 17. Оба ТС получают по 6d6 урона. Все пассажиры получают травму «Травма трахеи» (Whiplash).',
    vehicleType: 'all',
    actionCost: 'Стандартное действие'
  },
  {
    id: 'HARD_TURN',
    name: 'Крутой поворот',
    nameEn: 'Hard Turn',
    dc: 13,
    description: 'Поворот более чем на 90 градусов на высокой скорости без потери сцепления.',
    vehicleType: 'ground',
    actionCost: 'Действие перемещения/манёвра'
  },
  {
    id: 'QUICK_STOP',
    name: 'Экстренное торможение',
    nameEn: 'Quick Stop',
    dc: 13,
    description: 'Внезапная полная остановка без заноса и разворота.',
    vehicleType: 'ground',
    actionCost: 'Действие'
  },
  {
    id: 'SHARP_MANEUVER',
    name: 'Резкий манёвр (Объезд)',
    nameEn: 'Sharp Maneuver',
    dc: 13,
    description: 'Объезд внезапно возникшего препятствия, пешехода или обломков.',
    vehicleType: 'all',
    actionCost: 'Действие'
  },
  {
    id: 'DRIFT',
    name: 'Дрифт',
    nameEn: 'Drift',
    dc: 17,
    description: 'Контролируемый занос через узкие улицы или углы без потери скорости.',
    vehicleType: 'ground',
    actionCost: 'Действие'
  },
  {
    id: 'JUMP',
    name: 'Прыжок с трамплина',
    nameEn: 'Jump',
    dc: 17,
    description: 'Прыжок через разведенный мост, пандус или обрыв с успешным приземлением.',
    vehicleType: 'ground',
    actionCost: 'Действие'
  },
  {
    id: 'AIR_LANDING',
    name: 'Экстренная посадка',
    nameEn: 'Air Landing',
    dc: 13,
    description: 'Посадка воздушного ТС в экстремальных условиях или ограниченном пространстве.',
    vehicleType: 'air',
    actionCost: 'Действие'
  },
  {
    id: 'AIR_TRICK',
    name: 'Фигурный манёвр (Авиа)',
    nameEn: 'Air Trick',
    dc: 17,
    description: 'Бочка, петля или уход от наведения между небоскребами.',
    vehicleType: 'air',
    actionCost: 'Действие'
  }
];

// 2.3. Конверсия клеток сетки погони в дистанцию стрельбы
export interface RangeBandInfo {
  cells: number;
  metersRange: string;
  description: string;
  bandType: 'point-blank' | 'close' | 'medium' | 'long' | 'extreme' | 'breakaway';
  isRamPossible: boolean;
  dvRecommendation: {
    pistol: number;
    shotgunSlug: number;
    shotgunShell: number;
    ar: number;
    sniper: number;
    smg: number;
    rocket: number;
  };
}

export function getRangeBandFromCells(cellDiff: number): RangeBandInfo {
  const diff = Math.abs(cellDiff);
  if (diff === 0) {
    return {
      cells: 0,
      metersRange: '0–6 м',
      description: 'В упор (Point Blank). Физический контакт корпусов. Возможен таран!',
      bandType: 'point-blank',
      isRamPossible: true,
      dvRecommendation: {
        pistol: 13,
        shotgunSlug: 13,
        shotgunShell: 13,
        ar: 17,
        sniper: 30,
        smg: 15,
        rocket: 17
      }
    };
  } else if (diff === 1) {
    return {
      cells: 1,
      metersRange: '7–12 м',
      description: 'Близкая дистанция (Close, нижняя граница)',
      bandType: 'close',
      isRamPossible: false,
      dvRecommendation: {
        pistol: 15,
        shotgunSlug: 15,
        shotgunShell: 15,
        ar: 16,
        sniper: 25,
        smg: 13,
        rocket: 16
      }
    };
  } else if (diff === 2) {
    return {
      cells: 2,
      metersRange: '7–12 м',
      description: 'Близкая дистанция (Close, верхняя граница)',
      bandType: 'close',
      isRamPossible: false,
      dvRecommendation: {
        pistol: 15,
        shotgunSlug: 15,
        shotgunShell: 15,
        ar: 16,
        sniper: 25,
        smg: 13,
        rocket: 16
      }
    };
  } else if (diff >= 3 && diff <= 4) {
    return {
      cells: diff,
      metersRange: '13–25 м',
      description: 'Средняя дистанция (Medium)',
      bandType: 'medium',
      isRamPossible: false,
      dvRecommendation: {
        pistol: 20,
        shotgunSlug: 20,
        shotgunShell: 20,
        ar: 15,
        sniper: 20,
        smg: 15,
        rocket: 15
      }
    };
  } else if (diff >= 5 && diff <= 6) {
    return {
      cells: diff,
      metersRange: '26–50 м',
      description: 'Дальняя дистанция (Long)',
      bandType: 'long',
      isRamPossible: false,
      dvRecommendation: {
        pistol: 25,
        shotgunSlug: 25,
        shotgunShell: 25,
        ar: 16,
        sniper: 16,
        smg: 20,
        rocket: 16
      }
    };
  } else if (diff >= 7 && diff <= 8) {
    return {
      cells: diff,
      metersRange: '51–100 м',
      description: 'Предельная дистанция (Extreme)',
      bandType: 'extreme',
      isRamPossible: false,
      dvRecommendation: {
        pistol: 30,
        shotgunSlug: 30,
        shotgunShell: 30,
        ar: 17,
        sniper: 15,
        smg: 25,
        rocket: 17
      }
    };
  } else {
    return {
      cells: diff,
      metersRange: '> 100 м',
      description: 'Разрыв дистанции (> 8 клеток). Цель скрывается в потоке города!',
      bandType: 'breakaway',
      isRamPossible: false,
      dvRecommendation: {
        pistol: 99,
        shotgunSlug: 99,
        shotgunShell: 99,
        ar: 99,
        sniper: 99,
        smg: 99,
        rocket: 99
      }
    };
  }
}

// 4.1. Ограничение водителя (REF + Drive Check)
export function canOperatorTakeAction(operator: CharacterActor): boolean {
  const driverScore = operator.ref + operator.driveSkill + operator.driveBonus + (operator.tempDriveBonus || 0);
  // Если сумма < 9, оператор тратит всё внимание на контроль и теряет действие
  return driverScore >= 9;
}

export function getDriverConcentrationScore(operator: CharacterActor): number {
  return operator.ref + operator.driveSkill + operator.driveBonus + (operator.tempDriveBonus || 0);
}

// 4.2. Эффективная боевая скорость и деградация прочности
export function calculatePositioningDc(vehicle: Vehicle): PositioningRequirement {
  const isDamaged = vehicle.currentSdp < (vehicle.maxSdp / 2);
  let effectiveSpeedIndex = SPEED_TIERS.indexOf(vehicle.combatSpeed);

  if (effectiveSpeedIndex === -1) {
    // Найти ближайшую скорость из существующих
    effectiveSpeedIndex = SPEED_TIERS.findIndex(s => s <= vehicle.combatSpeed);
    if (effectiveSpeedIndex === -1) effectiveSpeedIndex = SPEED_TIERS.length - 1;
  }

  // При повреждениях ниже 50% ПСП скорость считается на категорию ниже
  if (isDamaged) {
    effectiveSpeedIndex += 1; // Сдвиг на категорию медленнее
  }

  // Если эффективная скорость падает ниже 8 СКО — крушение
  if (effectiveSpeedIndex >= SPEED_TIERS.length) {
    return { effectiveSpeed: 0, dc: 999, outOfControlCrash: true, isDamaged };
  }

  const effectiveSpeed = SPEED_TIERS[effectiveSpeedIndex];
  return {
    effectiveSpeed,
    dc: POSITIONING_DC_TABLE[effectiveSpeed] ?? 29,
    outOfControlCrash: false,
    isDamaged
  };
}

// 4.3. Обработка фазы позиционирования
export function resolvePositioning(
  participant: ChaseParticipant,
  choice: PositioningChoice,
  checkRollResult?: number // Результат броска: РЕФ + Навык + 1d10
): PositioningResolution {
  const { vehicle } = participant;
  const req = calculatePositioningDc(vehicle);

  if (req.outOfControlCrash) {
    vehicle.isOutOfControl = true;
    vehicle.isDestroyed = true;
    return {
      newPosition: participant.gridPosition,
      message: `${vehicle.name} теряет управляемость из-за критических структурных повреждений (СКО упала ниже 8) и разбивается!`,
      crashed: true,
      success: false,
      effectiveSpeed: 0,
      dc: 999
    };
  }

  switch (choice) {
    case 'MAINTAIN':
      // Поддержание скорости: 0 проверок, позиция не меняется
      return { 
        newPosition: participant.gridPosition, 
        message: 'Скорость удержана (0 клеток).', 
        crashed: false,
        success: true,
        effectiveSpeed: req.effectiveSpeed,
        dc: req.dc
      };

    case 'DECELERATE':
      // Замедление: смещение на 1 клетку назад, без проверки
      return { 
        newPosition: Math.max(0, participant.gridPosition - 1), 
        message: 'Транспорт сбросил скорость (-1 клетка назад).', 
        crashed: false,
        success: true,
        effectiveSpeed: req.effectiveSpeed,
        dc: req.dc
      };

    case 'ACCELERATE':
      if (checkRollResult === undefined) {
        throw new Error('Для ускорения требуется результат проверки навыка');
      }
      // Успех проверки продвигает вперед на 1 клетку
      if (checkRollResult >= req.dc) {
        return {
          newPosition: participant.gridPosition + 1,
          message: `Успех позиционирования (${checkRollResult} против СЛ ${req.dc}). +1 клетка вперёд!`,
          crashed: false,
          success: true,
          effectiveSpeed: req.effectiveSpeed,
          dc: req.dc
        };
      } else {
        // Провал: ТС остаётся на прежней клетке
        return {
          newPosition: participant.gridPosition,
          message: `Провал позиционирования (${checkRollResult} против СЛ ${req.dc}). ТС осталось на прежней клетке.`,
          crashed: false,
          success: false,
          effectiveSpeed: req.effectiveSpeed,
          dc: req.dc
        };
      }
  }
}

// 5. Проверка окончания погони (Exit Checks)
export function checkChaseTermination(participants: ChaseParticipant[]): { isOver: boolean; reason?: ChaseEndReason; message?: string } {
  const activeParticipants = participants.filter(p => !p.vehicle.isDestroyed && !p.vehicle.isOutOfControl);
  
  if (activeParticipants.length < 2 && participants.length >= 2) {
    return { 
      isOver: true, 
      reason: 'VEHICLE_WRECK',
      message: 'Одно или несколько ТС уничтожены либо вышли из-под контроля! Погоня завершена крушением.'
    };
  }

  const lead = participants.find(p => p.isLeadVehicle);
  const pursuers = participants.filter(p => !p.isLeadVehicle && !p.vehicle.isDestroyed && !p.vehicle.isOutOfControl);

  if (lead && pursuers.length > 0) {
    // Проверка отрыва: если ВСЕ преследователи отстали более чем на 8 клеток
    const leadEscaped = pursuers.every(pursuer => {
      const separation = Math.abs(lead.gridPosition - pursuer.gridPosition);
      return separation > 8;
    });

    if (leadEscaped) {
      return { 
        isOver: true, 
        reason: 'BREAKAWAY',
        message: 'Разрыв дистанции более 8 клеток (>100 м)! Ведущее транспортное средство оторвалось от преследования и скрылось в городе.'
      };
    }
  }

  return { isOver: false };
}

// Helper: Roll drive skill check with exploding d10
export function rollDriverCheck(
  actor: CharacterActor, 
  customMod = 0
): { total: number; d10Result: ReturnType<typeof rollD10Exploding>; modifier: number; breakdown: string } {
  const d10Result = rollD10Exploding();
  const modifier = actor.ref + actor.driveSkill + actor.driveBonus + (actor.tempDriveBonus || 0) + customMod;
  const total = d10Result.total + modifier;
  const breakdown = `[РЕФ ${actor.ref} + Вождение ${actor.driveSkill} + Бонусы ${actor.driveBonus + (actor.tempDriveBonus || 0) + customMod} = +${modifier}] + [d10: ${d10Result.breakdown}] = ${total}`;
  
  return {
    total,
    d10Result,
    modifier,
    breakdown
  };
}

// Helper: Resolve Ram attack
export function resolveRamAttack(
  attacker: ChaseParticipant,
  defender: ChaseParticipant,
  driverRoll?: number
): {
  success: boolean;
  dc: number;
  rollUsed: number;
  damageDiceRolls: number[];
  totalDamage: number;
  attackerDamageTaken: number;
  defenderDamageTaken: number;
  attackerNewSdp: number;
  defenderNewSdp: number;
  attackerSpAblated: boolean;
  defenderSpAblated: boolean;
  whiplashInjuredActors: string[];
  message: string;
} {
  const dc = MANEUVER_DIFFICULTIES.RAM;
  let finalRoll = driverRoll;
  
  if (finalRoll === undefined) {
    const rolled = rollDriverCheck(attacker.operator);
    finalRoll = rolled.total;
  }

  const success = finalRoll >= dc;
  
  // 6d6 урона по правилам Core Rulebook
  const damageDiceRolls: number[] = [];
  let totalDamage = 0;
  for (let i = 0; i < 6; i++) {
    const die = rollDice(1, 6);
    damageDiceRolls.push(die);
    totalDamage += die;
  }

  // Расчет урона сквозь броню ТС
  // Атакующее ТС
  const attackerSp = attacker.vehicle.armorSp;
  const attackerDamageTaken = Math.max(0, totalDamage - attackerSp);
  const attackerSpAblated = attackerDamageTaken > 0 && attackerSp > 0;
  const attackerNewSdp = Math.max(0, attacker.vehicle.currentSdp - attackerDamageTaken);

  // Обороняющееся ТС
  const defenderSp = defender.vehicle.armorSp;
  const defenderDamageTaken = Math.max(0, totalDamage - defenderSp);
  const defenderSpAblated = defenderDamageTaken > 0 && defenderSp > 0;
  const defenderNewSdp = Math.max(0, defender.vehicle.currentSdp - defenderDamageTaken);

  const whiplashInjuredActors: string[] = [
    attacker.operator.name,
    ...attacker.passengers.map(p => p.name),
    defender.operator.name,
    ...defender.passengers.map(p => p.name)
  ];

  const message = success
    ? `Таран успешен (${finalRoll} против СЛ ${dc})! Столкновение нанесло 6d6 (${damageDiceRolls.join('+')} = ${totalDamage}) урона. ${attacker.vehicle.name} получает ${attackerDamageTaken} урона (SDP: ${attackerNewSdp}), ${defender.vehicle.name} получает ${defenderDamageTaken} урона (SDP: ${defenderNewSdp}). Все участники получают травму трахеи (Whiplash)!`
    : `Неудачный маневр тарана (${finalRoll} против СЛ ${dc}). ТС разминулись в сантиметрах или водитель потерял управление!`;

  return {
    success,
    dc,
    rollUsed: finalRoll,
    damageDiceRolls,
    totalDamage,
    attackerDamageTaken,
    defenderDamageTaken,
    attackerNewSdp,
    defenderNewSdp,
    attackerSpAblated,
    defenderSpAblated,
    whiplashInjuredActors,
    message
  };
}

// Helper: Resolve NOS activation
export function resolveNosActivation(
  participant: ChaseParticipant,
  driverRoll?: number
): {
  success: boolean;
  dc: number;
  rollUsed: number;
  newPosition: number;
  isOutOfControl: boolean;
  message: string;
} {
  const dc = MANEUVER_DIFFICULTIES.NOS_ACTIVATION;
  let finalRoll = driverRoll;
  if (finalRoll === undefined) {
    const rolled = rollDriverCheck(participant.operator);
    finalRoll = rolled.total;
  }

  const success = finalRoll >= dc;
  const newPosition = participant.gridPosition + 1; // Всегда +1 клетка
  const isOutOfControl = !success;

  const message = success
    ? `NOS активирован! Мощное ускорение выбрасывает ${participant.vehicle.name} на +1 клетку вперёд (Позиция: ${newPosition}). Контроль удержан (${finalRoll} против СЛ ${dc}).`
    : `NOS активирован (+1 клетка вперёд), но проверка контроля провалена (${finalRoll} против СЛ ${dc})! ${participant.vehicle.name} выходит из-под контроля!`;

  return {
    success,
    dc,
    rollUsed: finalRoll,
    newPosition,
    isOutOfControl,
    message
  };
}

// Helper: Weak point shot calculation
export function calculateWeakPointShot(
  rawDamage: number,
  targetVehicleSp: number
): {
  penetrated: boolean;
  damageTaken: number;
  spAblation: number;
  remainingSp: number;
  message: string;
} {
  if (rawDamage <= targetVehicleSp) {
    return {
      penetrated: false,
      damageTaken: 0,
      spAblation: 0,
      remainingSp: targetVehicleSp,
      message: `Броня транспорта (SP ${targetVehicleSp}) отразила выстрел по уязвимым узлам (${rawDamage} урона). Пробития нет.`
    };
  }

  const throughDamage = rawDamage - targetVehicleSp;
  const finalDamage = throughDamage * 2; // По правилам ТЗ: урон сквозь броню удваивается
  const remainingSp = Math.max(0, targetVehicleSp - 1); // Броня истирается на 1

  return {
    penetrated: true,
    damageTaken: finalDamage,
    spAblation: 1,
    remainingSp,
    message: `Броня пробита! Урон сквозь броню (${throughDamage}) умножается на 2: итого ${finalDamage} урона по SDP! Броня снижена до ${remainingSp}.`
  };
}
