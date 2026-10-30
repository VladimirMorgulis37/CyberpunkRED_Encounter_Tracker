// Cyberpunk RED Vehicle & Driver Presets
// Based on Core Rulebook (p. 189-192) and Hot Pursuit DLC

import type { Vehicle, CharacterActor } from '@/types/chase';

export interface VehiclePreset {
  name: string;
  category: string;
  description: string;
  vehicle: Omit<Vehicle, 'id'>;
}

export const VEHICLE_PRESETS: VehiclePreset[] = [
  {
    name: 'Roadbike (Дорожный мотоцикл)',
    category: 'Мотоциклы',
    description: 'Обычный двухколесный байк на CHOOH2. Высокая маневренность, но открыт всем пулям.',
    vehicle: {
      name: 'Roadbike',
      type: 'ground',
      maxSdp: 35,
      currentSdp: 35,
      armorSp: 0,
      combatSpeed: 40,
      hasNos: false,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false,
      notes: 'Открытый транспорт. Пассажиры получают урон напрямую без защиты ТС.'
    }
  },
  {
    name: 'Superbike (Супербайк)',
    category: 'Мотоциклы',
    description: 'Гоночный мотоцикл колоссальной мощности (СКО 60). Невероятно быстр, но любая ошибка фатальна.',
    vehicle: {
      name: 'Superbike',
      type: 'ground',
      maxSdp: 35,
      currentSdp: 35,
      armorSp: 0,
      combatSpeed: 60,
      hasNos: false,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false,
      notes: 'СКО 60. Требует высочайшего мастерства водителя.'
    }
  },
  {
    name: 'Compact Groundcar (Компакткар)',
    category: 'Легковые авто',
    description: 'Маленькая городская микролитражка типа Archer Hella или Makigai MaiMai.',
    vehicle: {
      name: 'Compact Groundcar',
      type: 'ground',
      maxSdp: 50,
      currentSdp: 50,
      armorSp: 0,
      combatSpeed: 40,
      hasNos: false,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false
    }
  },
  {
    name: 'City Sedan (Городской седан)',
    category: 'Легковые авто',
    description: 'Стандартный четырёхдверный автомобиль (Villeneuve 340 или Chevillon). Рабочая лошадка Найт-Сити.',
    vehicle: {
      name: 'City Sedan',
      type: 'ground',
      maxSdp: 60,
      currentSdp: 60,
      armorSp: 0,
      combatSpeed: 40,
      hasNos: false,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false
    }
  },
  {
    name: 'High Performance Sportscar (Quadra Turbo-R)',
    category: 'Спорткары',
    description: 'Легендарный спортивный маслкар с мощным турбонаддувом и предустановленной системой закиси азота (NOS).',
    vehicle: {
      name: 'Quadra Turbo-R',
      type: 'ground',
      maxSdp: 60,
      currentSdp: 60,
      armorSp: 0,
      combatSpeed: 60,
      hasNos: true,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false,
      notes: 'Оснащен системой впрыска закиси азота (NOS).'
    }
  },
  {
    name: 'Supercar (Rayfield Caliburn / Aerondight)',
    category: 'Спорткары',
    description: 'Элитный суперкар неокитчевого стиля. Оборудован NOS и бронестеклом.',
    vehicle: {
      name: 'Rayfield Caliburn',
      type: 'ground',
      maxSdp: 60,
      currentSdp: 60,
      armorSp: 0,
      combatSpeed: 60,
      hasNos: true,
      hasBulletproofGlass: true,
      isDestroyed: false,
      isOutOfControl: false,
      notes: 'СКО 60, NOS, бронестекло кочевников.'
    }
  },
  {
    name: 'Nomad Heavy Pickup (Thorton Mackinaw)',
    category: 'Внедорожники и грузовики',
    description: 'Укрепленный внедорожник кочевников клана Альдекальдо с усиленной рамой и пуленепробиваемым стеклом.',
    vehicle: {
      name: 'Thorton Mackinaw (Nomad Mod)',
      type: 'ground',
      maxSdp: 80,
      currentSdp: 80,
      armorSp: 0,
      combatSpeed: 40,
      hasNos: false,
      hasBulletproofGlass: true,
      isDestroyed: false,
      isOutOfControl: false,
      notes: 'ПСП 80, пуленепробиваемое стекло.'
    }
  },
  {
    name: 'Combat Cab (Бронированное такси / Инкассатор)',
    category: 'Бронеавтомобили',
    description: 'Тяжелый бронированный кэб с броней SP 13 и пуленепробиваемыми стёклами. Создан выдерживать шквальный огонь.',
    vehicle: {
      name: 'Combat Cab Armored',
      type: 'ground',
      maxSdp: 80,
      currentSdp: 80,
      armorSp: 13,
      combatSpeed: 40,
      hasNos: false,
      hasBulletproofGlass: true,
      isDestroyed: false,
      isOutOfControl: false,
      notes: 'Броня SP 13 на корпус, бронестекло.'
    }
  },
  {
    name: 'Aerodyne AV-4 (Летающий аэродин Trauma Team)',
    category: 'Воздушный транспорт',
    description: 'Штурмовой аэродин на векторной тяге. SP 13, ПСП 100, СКО 60. Способен игнорировать наземные препятствия.',
    vehicle: {
      name: 'Aerodyne AV-4',
      type: 'air',
      maxSdp: 100,
      currentSdp: 100,
      armorSp: 13,
      combatSpeed: 60,
      hasNos: false,
      hasBulletproofGlass: true,
      isDestroyed: false,
      isOutOfControl: false,
      notes: 'Воздушный транспорт (Air). Игнорирует наземные заторы.'
    }
  },
  {
    name: 'Gyrocopter (Гирокоптер / Автожир)',
    category: 'Воздушный транспорт',
    description: 'Легкий одноместный вертолет/автожир. СКО 40, ПСП 40.',
    vehicle: {
      name: 'Gyrocopter',
      type: 'air',
      maxSdp: 40,
      currentSdp: 40,
      armorSp: 0,
      combatSpeed: 40,
      hasNos: false,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false
    }
  },
  {
    name: 'Speedboat (Скоростной катер)',
    category: 'Водный транспорт',
    description: 'Морской CHOOH2 катер для погонь по акватории залива Коронадо. СКО 60.',
    vehicle: {
      name: 'Coronado Speedboat',
      type: 'sea',
      maxSdp: 60,
      currentSdp: 60,
      armorSp: 0,
      combatSpeed: 60,
      hasNos: false,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false
    }
  },
  {
    name: 'Cabin Cruiser (Катер-яхта)',
    category: 'Водный транспорт',
    description: 'Массивное морское судно с каютой. ПСП 100, СКО 20.',
    vehicle: {
      name: 'Cabin Cruiser',
      type: 'sea',
      maxSdp: 100,
      currentSdp: 100,
      armorSp: 0,
      combatSpeed: 20,
      hasNos: false,
      hasBulletproofGlass: false,
      isDestroyed: false,
      isOutOfControl: false
    }
  }
];

export interface ActorPreset {
  name: string;
  role: string;
  description: string;
  actor: Omit<CharacterActor, 'id' | 'initiative'>;
}

export const ACTOR_PRESETS: ActorPreset[] = [
  {
    name: 'Nomad Outrider (Кочевник-водитель)',
    role: 'Nomad',
    description: 'Опытный кочевник клана, управляющий ТС с нейроинтерфейсом. Сумма: 8+6+2 = 16.',
    actor: {
      name: 'Nomad Outrider',
      ref: 8,
      dex: 7,
      driveSkill: 6,
      driveBonus: 2,
      hasInterfacePlugs: true,
      role: 'Nomad',
      isPC: false
    }
  },
  {
    name: 'Solo Wheelman (Профи-водитель Соло)',
    role: 'Solo',
    description: 'Боевой водитель с киберимплантами реакции и нейроразъемом. Сумма: 8+7+1 = 16.',
    actor: {
      name: 'Solo Wheelman',
      ref: 8,
      dex: 7,
      driveSkill: 7,
      driveBonus: 1,
      hasInterfacePlugs: true,
      role: 'Solo',
      isPC: false
    }
  },
  {
    name: 'NCPD Cruiser Cop (Офицер полиции)',
    role: 'Lawman',
    description: 'Стандартный патрульный полицейский Найт-Сити. Управляет руками. Сумма: 7+5+0 = 12.',
    actor: {
      name: 'Officer Higgins (NCPD)',
      ref: 7,
      dex: 6,
      driveSkill: 5,
      driveBonus: 0,
      hasInterfacePlugs: false,
      role: 'Lawman',
      isPC: false
    }
  },
  {
    name: 'Boosterganger Street Racer (Бандит-гонщик)',
    role: 'Ganger',
    description: 'Уличный лихач из банды Трик или Мальстрём на адреналине. Сумма: 6+3+0 = 9.',
    actor: {
      name: 'Spike (Tyger Claw)',
      ref: 6,
      dex: 5,
      driveSkill: 3,
      driveBonus: 0,
      hasInterfacePlugs: false,
      role: 'Ganger',
      isPC: false
    }
  },
  {
    name: 'Panicked Civilian (Паникующий гражданский)',
    role: 'Civilian',
    description: 'Случайный обыватель, не готовый к экстремальному вождению (РЕФ 5 + Вождение 2 = 7 < 9). Не может действовать во время руления!',
    actor: {
      name: 'Panicked Driver',
      ref: 5,
      dex: 4,
      driveSkill: 2,
      driveBonus: 0,
      hasInterfacePlugs: false,
      role: 'Civilian',
      isPC: false
    }
  },
  {
    name: 'Solo Gunner (Стрелок-пассажир)',
    role: 'Solo',
    description: 'Пассажир с тяжелым вооружением для прицельного огня по уязвимым узлам.',
    actor: {
      name: 'Solo Gunner',
      ref: 8,
      dex: 7,
      driveSkill: 2,
      driveBonus: 0,
      hasInterfacePlugs: false,
      role: 'Solo',
      isPC: false
    }
  }
];

export interface ChaseScenarioPreset {
  id: string;
  name: string;
  tag: string;
  description: string;
  participants: import('@/types/chase').ChaseParticipant[];
}

export const CHASE_SCENARIOS: ChaseScenarioPreset[] = [
  {
    id: 'ncpd-intercept',
    name: 'Городской перехват: Quadra vs NCPD',
    tag: 'Стритрейсинг / Город',
    description: 'Спорткар Quadra Turbo-R пытается уйти от полицейского седана NCPD с пуленепробиваемыми стёклами.',
    participants: [
      {
        id: 'scen-lead-1',
        gridPosition: 2,
        isLeadVehicle: true,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: false,
        vehicle: {
          id: 'v-scen-1',
          name: 'Quadra Turbo-R V-Tech',
          type: 'ground',
          maxSdp: 60,
          currentSdp: 60,
          armorSp: 0,
          combatSpeed: 60,
          hasNos: true,
          hasBulletproofGlass: false,
          isDestroyed: false,
          isOutOfControl: false,
          notes: 'Спорткар с системой NOS'
        },
        operator: {
          id: 'act-scen-1',
          name: 'Стритрейсер (Street Racer)',
          ref: 7,
          dex: 7,
          driveSkill: 6,
          driveBonus: 1,
          hasInterfacePlugs: true,
          initiative: 15,
          role: 'Solo',
          isPC: false
        },
        passengers: []
      },
      {
        id: 'scen-pursuer-1',
        gridPosition: 0,
        isLeadVehicle: false,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: true,
        vehicle: {
          id: 'v-scen-2',
          name: 'NCPD Cruiser (Chevillon)',
          type: 'ground',
          maxSdp: 60,
          currentSdp: 60,
          armorSp: 0,
          combatSpeed: 40,
          hasNos: false,
          hasBulletproofGlass: true,
          isDestroyed: false,
          isOutOfControl: false,
          notes: 'Патрульный седан с пуленепробиваемыми стеклами'
        },
        operator: {
          id: 'act-scen-2',
          name: 'Офицер Дэвис (NCPD Driver)',
          ref: 7,
          dex: 6,
          driveSkill: 5,
          driveBonus: 0,
          hasInterfacePlugs: false,
          initiative: 13,
          role: 'Lawman',
          isPC: false
        },
        passengers: [
          {
            id: 'act-scen-3',
            name: 'Офицер Ковач (NCPD Gunner)',
            ref: 7,
            dex: 6,
            driveSkill: 2,
            driveBonus: 0,
            hasInterfacePlugs: false,
            initiative: 12,
            role: 'Lawman',
            isPC: false
          }
        ]
      }
    ]
  },
  {
    id: 'badlands-ambush',
    name: 'Засада в Пустошах: Пикап Nomad vs Байкеры',
    tag: 'Пустоши / Рейдеры',
    description: 'Укрепленный тяжелый внедорожник клана кочевников отбивается от двух банд-байкеров на дорожных мотоциклах.',
    participants: [
      {
        id: 'scen-nomad-lead',
        gridPosition: 2,
        isLeadVehicle: true,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: false,
        vehicle: {
          id: 'v-nomad',
          name: 'Thorton Mackinaw (Nomad Mod)',
          type: 'ground',
          maxSdp: 80,
          currentSdp: 80,
          armorSp: 0,
          combatSpeed: 40,
          hasNos: false,
          hasBulletproofGlass: true,
          isDestroyed: false,
          isOutOfControl: false,
          notes: 'Укрепленный пикап с бронестеклом'
        },
        operator: {
          id: 'act-nom-1',
          name: 'Кочевник-водитель (Outrider)',
          ref: 8,
          dex: 7,
          driveSkill: 6,
          driveBonus: 2,
          hasInterfacePlugs: true,
          initiative: 16,
          role: 'Nomad',
          isPC: false
        },
        passengers: [
          {
            id: 'act-nom-2',
            name: 'Стрелок кузова (Nomad Gunner)',
            ref: 8,
            dex: 7,
            driveSkill: 2,
            driveBonus: 0,
            hasInterfacePlugs: false,
            initiative: 14,
            role: 'Nomad',
            isPC: false
          }
        ]
      },
      {
        id: 'scen-bike-1',
        gridPosition: 0,
        isLeadVehicle: false,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: true,
        vehicle: {
          id: 'v-bike-1',
          name: 'Рейдерский Roadbike #1',
          type: 'ground',
          maxSdp: 35,
          currentSdp: 35,
          armorSp: 0,
          combatSpeed: 40,
          hasNos: false,
          hasBulletproofGlass: false,
          isDestroyed: false,
          isOutOfControl: false
        },
        operator: {
          id: 'act-bike-1',
          name: 'Рейдер пустошей (Goon #1)',
          ref: 6,
          dex: 5,
          driveSkill: 4,
          driveBonus: 0,
          hasInterfacePlugs: false,
          initiative: 11,
          role: 'Ganger',
          isPC: false
        },
        passengers: []
      },
      {
        id: 'scen-bike-2',
        gridPosition: 0,
        isLeadVehicle: false,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: true,
        vehicle: {
          id: 'v-bike-2',
          name: 'Рейдерский Roadbike #2',
          type: 'ground',
          maxSdp: 35,
          currentSdp: 35,
          armorSp: 0,
          combatSpeed: 40,
          hasNos: false,
          hasBulletproofGlass: false,
          isDestroyed: false,
          isOutOfControl: false
        },
        operator: {
          id: 'act-bike-2',
          name: 'Рейдер пустошей (Goon #2)',
          ref: 6,
          dex: 5,
          driveSkill: 3,
          driveBonus: 0,
          hasInterfacePlugs: false,
          initiative: 10,
          role: 'Ganger',
          isPC: false
        },
        passengers: []
      }
    ]
  },
  {
    id: 'corp-convoy',
    name: 'Перехват броневика: Combat Cab vs Супербайк',
    tag: 'Корпорации / Ограбление',
    description: 'Тяжелый корпоративный броневик (SP 13) против элитного наемника на быстроходном супербайке (СКО 60).',
    participants: [
      {
        id: 'scen-corp-lead',
        gridPosition: 1,
        isLeadVehicle: true,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: false,
        vehicle: {
          id: 'v-cab',
          name: 'Combat Cab Armored',
          type: 'ground',
          maxSdp: 80,
          currentSdp: 80,
          armorSp: 13,
          combatSpeed: 40,
          hasNos: false,
          hasBulletproofGlass: true,
          isDestroyed: false,
          isOutOfControl: false,
          notes: 'Броня SP 13, бронестекло'
        },
        operator: {
          id: 'act-corp-driver',
          name: 'Корпоративный водитель',
          ref: 7,
          dex: 6,
          driveSkill: 5,
          driveBonus: 1,
          hasInterfacePlugs: true,
          initiative: 14,
          role: 'Corp',
          isPC: false
        },
        passengers: [
          {
            id: 'act-corp-guard',
            name: 'Охранник инкассации',
            ref: 7,
            dex: 6,
            driveSkill: 2,
            driveBonus: 0,
            hasInterfacePlugs: false,
            initiative: 13,
            role: 'Solo',
            isPC: false
          }
        ]
      },
      {
        id: 'scen-superbike',
        gridPosition: 0,
        isLeadVehicle: false,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: false,
        vehicle: {
          id: 'v-sbike',
          name: 'Superbike (СКО 60)',
          type: 'ground',
          maxSdp: 35,
          currentSdp: 35,
          armorSp: 0,
          combatSpeed: 60,
          hasNos: false,
          hasBulletproofGlass: false,
          isDestroyed: false,
          isOutOfControl: false
        },
        operator: {
          id: 'act-solo-wheelman',
          name: 'Наёмник Соло (Wheelman)',
          ref: 8,
          dex: 7,
          driveSkill: 7,
          driveBonus: 1,
          hasInterfacePlugs: true,
          initiative: 17,
          role: 'Solo',
          isPC: false
        },
        passengers: []
      }
    ]
  },
  {
    id: 'air-duel',
    name: 'Воздушный перехват: AV-4 vs Гирокоптер',
    tag: 'Авиация / Небоскрёбы',
    description: 'Штурмовой аэродин Trauma Team (SP 13, СКО 60) против юркого боевого гирокоптера в небе над центром Найт-Сити.',
    participants: [
      {
        id: 'scen-av4',
        gridPosition: 2,
        isLeadVehicle: true,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: false,
        vehicle: {
          id: 'v-av4',
          name: 'Aerodyne AV-4 (Trauma Team)',
          type: 'air',
          maxSdp: 100,
          currentSdp: 100,
          armorSp: 13,
          combatSpeed: 60,
          hasNos: false,
          hasBulletproofGlass: true,
          isDestroyed: false,
          isOutOfControl: false,
          notes: 'Воздушный бронеаэродин'
        },
        operator: {
          id: 'act-tt-pilot',
          name: 'Пилот Trauma Team',
          ref: 8,
          dex: 7,
          driveSkill: 6,
          driveBonus: 2,
          hasInterfacePlugs: true,
          initiative: 16,
          role: 'Medtech',
          isPC: false
        },
        passengers: []
      },
      {
        id: 'scen-gyro',
        gridPosition: 0,
        isLeadVehicle: false,
        hasUsedActionThisTurn: false,
        isDrivingOneHanded: true,
        vehicle: {
          id: 'v-gyro',
          name: 'Боевой Gyrocopter',
          type: 'air',
          maxSdp: 40,
          currentSdp: 40,
          armorSp: 0,
          combatSpeed: 40,
          hasNos: false,
          hasBulletproofGlass: false,
          isDestroyed: false,
          isOutOfControl: false
        },
        operator: {
          id: 'act-gyro-pilot',
          name: 'Воздушный наёмник',
          ref: 7,
          dex: 6,
          driveSkill: 5,
          driveBonus: 0,
          hasInterfacePlugs: false,
          initiative: 13,
          role: 'Solo',
          isPC: false
        },
        passengers: []
      }
    ]
  }
];
