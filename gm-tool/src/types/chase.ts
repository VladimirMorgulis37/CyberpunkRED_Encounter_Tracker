// Cyberpunk RED Chase System Data Models & Types
// Based on Core Rulebook (p. 189-192) and Hot Pursuit DLC (May 2024)

export type VehicleType = 'ground' | 'air' | 'sea';

export interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  maxSdp: number;          // Максимальные пункты прочности структуры (ПСП / SDP)
  currentSdp: number;      // Текущие ПСП
  armorSp: number;         // Очки структуры брони (ОС / SP)
  combatSpeed: number;     // Боевая скорость (СКО / Combat Speed в м/ход: 60, 40, 20, 15, 10, 8)
  hasNos: boolean;         // Наличие системы закиси азота
  hasBulletproofGlass: boolean; // Модификация кочевника: пуленепробиваемое стекло
  isDestroyed: boolean;
  isOutOfControl: boolean; // Флаг потери контроля
  image?: string;
  notes?: string;
}

export interface CharacterActor {
  id: string;
  name: string;
  ref: number;             // Характеристика РЕФ (REF)
  dex: number;             // Характеристика ЛВК (DEX)
  driveSkill: number;      // Соответствующий навык управления (Наземный/Воздушный/Морской)
  driveBonus: number;      // Модификаторы и киберимпланты вождения
  hasInterfacePlugs: boolean; // Нейроинтерфейсный разъем (управление без рук)
  initiative: number;      // Инициатива (РЕФ + 1d10)
  tempDriveBonus?: number; // Временный бонус в текущем раунде (например от помощи пассажира)
  role?: string;
  isPC?: boolean;
}

export interface ChaseParticipant {
  id: string;
  vehicle: Vehicle;
  operator: CharacterActor; // Водитель/пилот
  passengers: CharacterActor[]; // Пассажиры
  gridPosition: number;     // Позиция на линейной сетке погони (целое число от 0 до N)
  isLeadVehicle: boolean;   // Ведущее ТС (цель преследования)
  hasUsedActionThisTurn: boolean;
  isDrivingOneHanded: boolean; // Если нет нейроинтерфейса, 1 рука всегда занята
}

export type ChaseEndReason = 
  | 'BREAKAWAY'     // Разрыв дистанции более 8 клеток
  | 'VEHICLE_WRECK' // ТС уничтожено или потеряло управление со срывом скорости
  | 'HEAD_ON'       // Разворот ведущего ТС в лоб (переход в тактический бой)
  | 'VOLUNTARY_STOP'; // Добровольная остановка

export type PositioningChoice = 'ACCELERATE' | 'MAINTAIN' | 'DECELERATE';

export interface PositioningRequirement {
  effectiveSpeed: number;
  dc: number;
  outOfControlCrash: boolean;
  isDamaged: boolean;
}

export interface PositioningResolution {
  newPosition: number;
  message: string;
  crashed: boolean;
  success?: boolean;
  effectiveSpeed: number;
  dc: number;
}

export interface ChaseLogEntry {
  id: string;
  timestamp: string;
  round: number;
  actorName?: string;
  vehicleName?: string;
  actionType: 'MANEUVER' | 'NOS' | 'RAM' | 'POSITIONING' | 'ATTACK' | 'COMPLEMENTARY' | 'STATUS' | 'TERMINATION';
  title: string;
  details: string;
  roll?: {
    d10: number;
    modifier: number;
    total: number;
    targetDc: number;
    success: boolean;
    breakdown?: string;
  };
  damage?: number;
}

export interface ChaseState {
  round: number;
  participants: ChaseParticipant[];
  initiativeOrder: string[]; // Массив ID участников (водители и пассажиры)
  currentTurnActorId: string;
  activeObstacleDc: number | null; // СЛ обязательного маневра в раунде, если задано рефери
  isFinished: boolean;
  finishReason?: ChaseEndReason;
  logs: ChaseLogEntry[];
}
