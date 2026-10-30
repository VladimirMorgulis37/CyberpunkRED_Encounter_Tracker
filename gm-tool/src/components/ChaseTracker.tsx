import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Car, Gauge, Zap, Flame, Shield,
  Crosshair, Activity, Flag, AlertTriangle,
  ChevronRight, Plus, Trash2, Users, Target,
  Dice5, Skull, Check, X, Plane, Anchor,
  Copy, Award, FastForward, Swords, ShieldCheck,
  FolderOpen, Sparkles, BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { rollD10Exploding } from '@/lib/combatEngine';
import { rollDice } from '@/lib/dice';
import type { 
  Vehicle, 
  CharacterActor, 
  ChaseParticipant, 
  ChaseState, 
  ChaseLogEntry,
  PositioningChoice,
  ChaseEndReason
} from '@/types/chase';
import type { Participant } from '@/types';
import {
  POSITIONING_DC_TABLE,
  SPEED_TIERS,
  MANEUVER_LIST,
  getRangeBandFromCells,
  canOperatorTakeAction,
  getDriverConcentrationScore,
  calculatePositioningDc,
  resolvePositioning,
  checkChaseTermination,
  rollDriverCheck,
  resolveRamAttack,
  resolveNosActivation,
  calculateWeakPointShot
} from '@/lib/chase';
import { VEHICLE_PRESETS, CHASE_SCENARIOS, ACTOR_PRESETS } from '@/data/vehiclePresets';

interface ChaseTrackerProps {
  encounterParticipants?: Participant[];
  onSwitchToTacticalCombat?: () => void;
}

// Clean initial empty state with NO hardcoded mock combatants
const EMPTY_INITIAL_STATE: ChaseState = {
  round: 1,
  participants: [],
  initiativeOrder: [],
  currentTurnActorId: '',
  activeObstacleDc: null,
  isFinished: false,
  logs: []
};

export const ChaseTracker: React.FC<ChaseTrackerProps> = ({ 
  encounterParticipants = [],
  onSwitchToTacticalCombat
}) => {
  // Local storage state with clean key
  const [chaseState, setChaseState] = useLocalStorage<ChaseState>('cyberpunk-chase-state-v4', EMPTY_INITIAL_STATE);

  // Range inspector selected pair
  const [selectedPair, setSelectedPair] = useState<{ aId: string; bId: string }>({ aId: '', bId: '' });

  // Modals
  const [endRoundModalOpen, setEndRoundModalOpen] = useState(false);
  const [addVehicleModalOpen, setAddVehicleModalOpen] = useState(false);
  const [scenariosModalOpen, setScenariosModalOpen] = useState(false);
  const [ramModalOpen, setRamModalOpen] = useState(false);
  const [weakPointModalOpen, setWeakPointModalOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // End of Round decisions state: participantId -> { choice, manualRoll?: number, rollBreakdown?: string }
  const [endRoundDecisions, setEndRoundDecisions] = useState<Record<string, { choice: PositioningChoice; roll?: number; rollBreakdown?: string }>>({});

  // Helper log recorder
  const addLog = useCallback((entry: Omit<ChaseLogEntry, 'id' | 'timestamp' | 'round'>) => {
    const newEntry: ChaseLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      round: chaseState.round,
      ...entry
    };
    setChaseState(prev => ({
      ...prev,
      logs: [newEntry, ...prev.logs.slice(0, 99)]
    }));
  }, [chaseState.round, setChaseState]);

  // Sync selectedPair when participants change
  useEffect(() => {
    if (chaseState.participants.length >= 2) {
      const existsA = chaseState.participants.some(p => p.id === selectedPair.aId);
      const existsB = chaseState.participants.some(p => p.id === selectedPair.bId);
      if (!existsA || !existsB) {
        setSelectedPair({
          aId: chaseState.participants[0].id,
          bId: chaseState.participants[1].id
        });
      }
    } else if (chaseState.participants.length === 1) {
      setSelectedPair({
        aId: chaseState.participants[0].id,
        bId: ''
      });
    } else {
      setSelectedPair({ aId: '', bId: '' });
    }
  }, [chaseState.participants, selectedPair.aId, selectedPair.bId]);

  // Derived: Flattened list of actors (drivers + passengers) with their vehicle mapping
  const allActors = useMemo(() => {
    const list: Array<{
      actor: CharacterActor;
      vehicle: Vehicle;
      participant: ChaseParticipant;
      isDriver: boolean;
    }> = [];

    chaseState.participants.forEach(p => {
      list.push({
        actor: p.operator,
        vehicle: p.vehicle,
        participant: p,
        isDriver: true
      });
      p.passengers.forEach(pass => {
        list.push({
          actor: pass,
          vehicle: p.vehicle,
          participant: p,
          isDriver: false
        });
      });
    });

    return list;
  }, [chaseState.participants]);

  // Derived: Current turn actor
  const currentActorInfo = useMemo(() => {
    return allActors.find(a => a.actor.id === chaseState.currentTurnActorId) || allActors[0] || null;
  }, [allActors, chaseState.currentTurnActorId]);

  // Derived: Range Band between selected pair
  const currentRangeBand = useMemo(() => {
    if (chaseState.participants.length < 2) return null;
    const partA = chaseState.participants.find(p => p.id === selectedPair.aId) || chaseState.participants[0];
    const partB = chaseState.participants.find(p => p.id === selectedPair.bId) || chaseState.participants[1];
    if (!partA || !partB || partA.id === partB.id) return null;
    const diff = Math.abs(partA.gridPosition - partB.gridPosition);
    return {
      partA,
      partB,
      diff,
      info: getRangeBandFromCells(diff)
    };
  }, [chaseState.participants, selectedPair]);

  // Max grid position currently on track to size the track nicely
  const maxGridPosition = useMemo(() => {
    if (chaseState.participants.length === 0) return 10;
    const maxPos = Math.max(8, ...chaseState.participants.map(p => p.gridPosition));
    return Math.max(10, maxPos + 2);
  }, [chaseState.participants]);

  // ===================== ACTIONS =====================

  // Load a scenario template
  const loadScenario = useCallback((scenarioId: string) => {
    const scen = CHASE_SCENARIOS.find(s => s.id === scenarioId);
    if (!scen) return;

    const actorIds: string[] = [];
    scen.participants.forEach(p => {
      actorIds.push(p.operator.id);
      p.passengers.forEach(pass => actorIds.push(pass.id));
    });

    setChaseState({
      round: 1,
      participants: scen.participants,
      initiativeOrder: actorIds,
      currentTurnActorId: actorIds[0] || '',
      activeObstacleDc: null,
      isFinished: false,
      logs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          round: 1,
          actionType: 'STATUS',
          title: `Загружен шаблон: ${scen.name}`,
          details: scen.description
        }
      ]
    });

    if (scen.participants.length >= 2) {
      setSelectedPair({
        aId: scen.participants[0].id,
        bId: scen.participants[1].id
      });
    }

    setScenariosModalOpen(false);
    toast.success(`Шаблон «${scen.name}» загружен!`);
  }, [setChaseState]);

  // Clear Chase to clean state
  const handleClearChase = useCallback(() => {
    setChaseState(EMPTY_INITIAL_STATE);
    setSelectedPair({ aId: '', bId: '' });
    setClearConfirmOpen(false);
    toast.info('Погоня очищена. Добавьте участников или выберите шаблон.');
  }, [setChaseState]);

  // Roll initiative for all actors
  const rollAllInitiatives = useCallback(() => {
    if (chaseState.participants.length === 0) return;

    const newParticipants = chaseState.participants.map(p => {
      const opRoll = p.operator.ref + rollDice(1, 10);
      const updatedOp = { ...p.operator, initiative: opRoll };

      const updatedPassengers = p.passengers.map(pass => {
        const passRoll = pass.ref + rollDice(1, 10);
        return { ...pass, initiative: passRoll };
      });

      return {
        ...p,
        operator: updatedOp,
        passengers: updatedPassengers
      };
    });

    const actorsList: Array<{ id: string; initiative: number }> = [];
    newParticipants.forEach(p => {
      actorsList.push({ id: p.operator.id, initiative: p.operator.initiative });
      p.passengers.forEach(pass => actorsList.push({ id: pass.id, initiative: pass.initiative }));
    });
    actorsList.sort((a, b) => b.initiative - a.initiative);

    const newOrder = actorsList.map(a => a.id);

    setChaseState(prev => ({
      ...prev,
      participants: newParticipants,
      initiativeOrder: newOrder,
      currentTurnActorId: newOrder[0] || ''
    }));

    toast.success('Инициатива участников погони переброшена!');
    addLog({
      actionType: 'STATUS',
      title: 'Бросок инициативы',
      details: 'Инициатива всех водителей и пассажиров обновлена.'
    });
  }, [chaseState.participants, setChaseState, addLog]);

  // Next Turn
  const nextTurn = useCallback(() => {
    if (chaseState.initiativeOrder.length === 0) return;
    const currentIndex = chaseState.initiativeOrder.indexOf(chaseState.currentTurnActorId);
    const nextIndex = (currentIndex + 1) % chaseState.initiativeOrder.length;
    const nextActorId = chaseState.initiativeOrder[nextIndex];

    setChaseState(prev => ({
      ...prev,
      currentTurnActorId: nextActorId
    }));
  }, [chaseState.initiativeOrder, chaseState.currentTurnActorId, setChaseState]);

  // Prev Turn
  const prevTurn = useCallback(() => {
    if (chaseState.initiativeOrder.length === 0) return;
    const currentIndex = chaseState.initiativeOrder.indexOf(chaseState.currentTurnActorId);
    const prevIndex = (currentIndex - 1 + chaseState.initiativeOrder.length) % chaseState.initiativeOrder.length;
    const prevActorId = chaseState.initiativeOrder[prevIndex];

    setChaseState(prev => ({
      ...prev,
      currentTurnActorId: prevActorId
    }));
  }, [chaseState.initiativeOrder, chaseState.currentTurnActorId, setChaseState]);

  // Manual move vehicle on grid
  const manualMoveVehicle = useCallback((participantId: string, delta: number) => {
    setChaseState(prev => {
      const updated = prev.participants.map(p => {
        if (p.id === participantId) {
          return { ...p, gridPosition: Math.max(0, p.gridPosition + delta) };
        }
        return p;
      });
      return { ...prev, participants: updated };
    });
  }, [setChaseState]);

  // Toggle vehicle out of control
  const toggleOutOfControl = useCallback((participantId: string) => {
    setChaseState(prev => {
      const updated = prev.participants.map(p => {
        if (p.id === participantId) {
          const newVal = !p.vehicle.isOutOfControl;
          return {
            ...p,
            vehicle: { ...p.vehicle, isOutOfControl: newVal }
          };
        }
        return p;
      });
      return { ...prev, participants: updated };
    });
  }, [setChaseState]);

  // Apply damage / repair to vehicle SDP
  const adjustSdp = useCallback((participantId: string, delta: number) => {
    setChaseState(prev => {
      const updated = prev.participants.map(p => {
        if (p.id === participantId) {
          const newSdp = Math.max(0, Math.min(p.vehicle.maxSdp, p.vehicle.currentSdp + delta));
          const isDestroyed = newSdp === 0;
          return {
            ...p,
            vehicle: {
              ...p.vehicle,
              currentSdp: newSdp,
              isDestroyed: isDestroyed || p.vehicle.isDestroyed
            }
          };
        }
        return p;
      });
      return { ...prev, participants: updated };
    });
  }, [setChaseState]);

  // Apply damage / repair to vehicle Armor SP
  const adjustArmorSp = useCallback((participantId: string, delta: number) => {
    setChaseState(prev => {
      const updated = prev.participants.map(p => {
        if (p.id === participantId) {
          const newSp = Math.max(0, p.vehicle.armorSp + delta);
          return {
            ...p,
            vehicle: { ...p.vehicle, armorSp: newSp }
          };
        }
        return p;
      });
      return { ...prev, participants: updated };
    });
  }, [setChaseState]);

  // Execute Maneuver by Driver
  const executeManeuver = useCallback((maneuverId: string) => {
    if (!currentActorInfo || !currentActorInfo.isDriver) {
      toast.error('Только текущий водитель может выполнять манёвры!');
      return;
    }

    const maneuver = MANEUVER_LIST.find(m => m.id === maneuverId);
    if (!maneuver) return;

    const roll = rollDriverCheck(currentActorInfo.actor);
    const success = roll.total >= maneuver.dc;

    if (success) {
      toast.success(`Успех манёвра «${maneuver.name}»! (${roll.total} vs СЛ ${maneuver.dc})`);
    } else {
      toast.error(`Провал манёвра «${maneuver.name}»! (${roll.total} vs СЛ ${maneuver.dc})`);
    }

    addLog({
      actorName: currentActorInfo.actor.name,
      vehicleName: currentActorInfo.vehicle.name,
      actionType: 'MANEUVER',
      title: `Манёвр: ${maneuver.name}`,
      details: `${success ? 'Успешно выполнен!' : 'Провал! ТС заносит или теряется контроль.'} ${maneuver.description}`,
      roll: {
        d10: roll.d10Result.total,
        modifier: roll.modifier,
        total: roll.total,
        targetDc: maneuver.dc,
        success,
        breakdown: roll.breakdown
      }
    });
  }, [currentActorInfo, addLog]);

  // Execute NOS
  const executeNos = useCallback(() => {
    if (!currentActorInfo || !currentActorInfo.isDriver) return;
    const participant = currentActorInfo.participant;
    if (!participant.vehicle.hasNos) {
      toast.error('На этом ТС нет системы закиси азота (NOS)!');
      return;
    }

    const roll = rollDriverCheck(currentActorInfo.actor);
    const result = resolveNosActivation(participant, roll.total);

    setChaseState(prev => {
      const updated = prev.participants.map(p => {
        if (p.id === participant.id) {
          return {
            ...p,
            gridPosition: result.newPosition,
            vehicle: {
              ...p.vehicle,
              isOutOfControl: result.isOutOfControl ? true : p.vehicle.isOutOfControl
            }
          };
        }
        return p;
      });
      return { ...prev, participants: updated };
    });

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }

    addLog({
      actorName: currentActorInfo.actor.name,
      vehicleName: currentActorInfo.vehicle.name,
      actionType: 'NOS',
      title: 'Активация NOS',
      details: result.message,
      roll: {
        d10: roll.d10Result.total,
        modifier: roll.modifier,
        total: roll.total,
        targetDc: result.dc,
        success: result.success,
        breakdown: roll.breakdown
      }
    });
  }, [currentActorInfo, setChaseState, addLog]);

  // Execute Ram against a vehicle at distance 0
  const executeRam = useCallback((targetParticipantId: string) => {
    if (!currentActorInfo || !currentActorInfo.isDriver) return;
    const attackerPart = currentActorInfo.participant;
    const defenderPart = chaseState.participants.find(p => p.id === targetParticipantId);

    if (!defenderPart) {
      toast.error('Цель для тарана не найдена!');
      return;
    }

    if (attackerPart.gridPosition !== defenderPart.gridPosition) {
      toast.error('Таран возможен только при нахождении на одной клетке (дистанция 0)!');
      return;
    }

    const roll = rollDriverCheck(currentActorInfo.actor);
    const result = resolveRamAttack(attackerPart, defenderPart, roll.total);

    setChaseState(prev => {
      const updated = prev.participants.map(p => {
        if (p.id === attackerPart.id) {
          return {
            ...p,
            vehicle: {
              ...p.vehicle,
              currentSdp: result.attackerNewSdp,
              armorSp: result.attackerSpAblated ? Math.max(0, p.vehicle.armorSp - 1) : p.vehicle.armorSp,
              isDestroyed: result.attackerNewSdp === 0 || p.vehicle.isDestroyed
            }
          };
        }
        if (p.id === defenderPart.id) {
          return {
            ...p,
            vehicle: {
              ...p.vehicle,
              currentSdp: result.defenderNewSdp,
              armorSp: result.defenderSpAblated ? Math.max(0, p.vehicle.armorSp - 1) : p.vehicle.armorSp,
              isDestroyed: result.defenderNewSdp === 0 || p.vehicle.isDestroyed
            }
          };
        }
        return p;
      });
      return { ...prev, participants: updated };
    });

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }

    addLog({
      actorName: currentActorInfo.actor.name,
      vehicleName: currentActorInfo.vehicle.name,
      actionType: 'RAM',
      title: `Таран: ${attackerPart.vehicle.name} -> ${defenderPart.vehicle.name}`,
      details: result.message,
      damage: result.totalDamage,
      roll: {
        d10: roll.d10Result.total,
        modifier: roll.modifier,
        total: roll.total,
        targetDc: result.dc,
        success: result.success,
        breakdown: roll.breakdown
      }
    });

    setRamModalOpen(false);
  }, [currentActorInfo, chaseState.participants, setChaseState, addLog]);

  // Passenger Complementary Check (Помощь водителю)
  const executeComplementaryCheck = useCallback(() => {
    if (!currentActorInfo || currentActorInfo.isDriver) {
      toast.error('Только пассажир может совершать комплементарный чек!');
      return;
    }

    const d10 = rollD10Exploding();
    const bonus = currentActorInfo.actor.ref + 2;
    const total = d10.total + bonus;
    const dc = 13;
    const success = total >= dc;

    if (success) {
      setChaseState(prev => {
        const updated = prev.participants.map(p => {
          if (p.id === currentActorInfo.participant.id) {
            return {
              ...p,
              operator: {
                ...p.operator,
                tempDriveBonus: (p.operator.tempDriveBonus || 0) + 1
              }
            };
          }
          return p;
        });
        return { ...prev, participants: updated };
      });
      toast.success(`Помощь водителю успешна! (${total} vs СЛ ${dc}). Водитель получает +1 к следующей проверке!`);
    } else {
      toast.error(`Помощь не удалась (${total} vs СЛ ${dc}). Бонус не получен.`);
    }

    addLog({
      actorName: currentActorInfo.actor.name,
      vehicleName: currentActorInfo.vehicle.name,
      actionType: 'COMPLEMENTARY',
      title: 'Помощь водителю (Complementary Check)',
      details: success 
        ? `${currentActorInfo.actor.name} вовремя предупреждает об опасности на дороге! Водитель получает +1 к проверкам в этом раунде.`
        : `${currentActorInfo.actor.name} замешкался или дал неверную подсказку.`,
      roll: {
        d10: d10.total,
        modifier: bonus,
        total,
        targetDc: dc,
        success,
        breakdown: `[РЕФ/Внимание +${bonus}] + [d10: ${d10.breakdown}] = ${total}`
      }
    });
  }, [currentActorInfo, setChaseState, addLog]);

  // Initialize End of Round Modal with defaults
  const handleOpenEndRound = useCallback(() => {
    const initialDecisions: Record<string, { choice: PositioningChoice; roll?: number; rollBreakdown?: string }> = {};
    chaseState.participants.forEach(p => {
      initialDecisions[p.id] = { choice: 'ACCELERATE' };
    });
    setEndRoundDecisions(initialDecisions);
    setEndRoundModalOpen(true);
  }, [chaseState.participants]);

  // Roll positioning check for a specific vehicle in the End Round modal
  const handleRollEndRoundCheck = useCallback((participantId: string) => {
    const part = chaseState.participants.find(p => p.id === participantId);
    if (!part) return;

    const rolled = rollDriverCheck(part.operator);
    setEndRoundDecisions(prev => ({
      ...prev,
      [participantId]: {
        ...prev[participantId],
        choice: prev[participantId]?.choice || 'ACCELERATE',
        roll: rolled.total,
        rollBreakdown: rolled.breakdown
      }
    }));
  }, [chaseState.participants]);

  // Apply End of Round positioning and check termination
  const applyEndRoundPositioning = useCallback(() => {
    let terminationTriggered = false;
    let terminationReason: ChaseEndReason | undefined;
    let terminationMsg: string | undefined;

    const updatedParticipants = chaseState.participants.map(p => {
      const decision = endRoundDecisions[p.id] || { choice: 'MAINTAIN' };
      const resolution = resolvePositioning(p, decision.choice, decision.roll);

      addLog({
        actorName: p.operator.name,
        vehicleName: p.vehicle.name,
        actionType: 'POSITIONING',
        title: `Конец раунда: ${p.vehicle.name}`,
        details: `Выбор: ${decision.choice === 'ACCELERATE' ? 'Ускорение' : decision.choice === 'MAINTAIN' ? 'Удержание' : 'Замедление'}. ${resolution.message}`,
        roll: decision.roll !== undefined ? {
          d10: 0,
          modifier: 0,
          total: decision.roll,
          targetDc: resolution.dc,
          success: !!resolution.success,
          breakdown: decision.rollBreakdown
        } : undefined
      });

      return {
        ...p,
        gridPosition: resolution.newPosition,
        hasUsedActionThisTurn: false,
        vehicle: {
          ...p.vehicle,
          isOutOfControl: resolution.crashed ? true : p.vehicle.isOutOfControl,
          isDestroyed: resolution.crashed ? true : p.vehicle.isDestroyed
        },
        operator: {
          ...p.operator,
          tempDriveBonus: 0
        }
      };
    });

    const exitCheck = checkChaseTermination(updatedParticipants);
    if (exitCheck.isOver) {
      terminationTriggered = true;
      terminationReason = exitCheck.reason;
      terminationMsg = exitCheck.message;
    }

    setChaseState(prev => ({
      ...prev,
      round: prev.round + 1,
      participants: updatedParticipants,
      isFinished: terminationTriggered,
      finishReason: terminationReason,
      currentTurnActorId: prev.initiativeOrder[0] || ''
    }));

    setEndRoundModalOpen(false);

    if (terminationTriggered) {
      toast.error(`ПОГОНЯ ЗАВЕРШЕНА! Причина: ${terminationReason}. ${terminationMsg}`);
      addLog({
        actionType: 'TERMINATION',
        title: `Финал погони (${terminationReason})`,
        details: terminationMsg || 'Условия преследования завершены.'
      });
    } else {
      toast.success(`Раунд ${chaseState.round} завершен! Начат раунд ${chaseState.round + 1}.`);
    }
  }, [chaseState.participants, chaseState.round, endRoundDecisions, setChaseState, addLog]);

  // Remove participant
  const handleRemoveParticipant = useCallback((participantId: string) => {
    setChaseState(prev => {
      const updated = prev.participants.filter(p => p.id !== participantId);
      const remainingActorIds = prev.initiativeOrder.filter(actId => {
        const stillExists = updated.some(p => p.operator.id === actId || p.passengers.some(pass => pass.id === actId));
        return stillExists;
      });
      return {
        ...prev,
        participants: updated,
        initiativeOrder: remainingActorIds,
        currentTurnActorId: remainingActorIds[0] || ''
      };
    });
    toast.info('Транспортное средство удалено из погони.');
  }, [setChaseState]);

  // Toggle Lead Vehicle
  const handleSetLead = useCallback((participantId: string) => {
    setChaseState(prev => {
      const updated = prev.participants.map(p => ({
        ...p,
        isLeadVehicle: p.id === participantId
      }));
      return { ...prev, participants: updated };
    });
    toast.success('Ведущее ТС (цель преследования) изменено!');
  }, [setChaseState]);

  // Helper: Get vehicle icon component
  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'air': return Plane;
      case 'sea': return Anchor;
      default: return Car;
    }
  };

  // Check driver concentration rule for current actor
  const driverConcentrationScore = currentActorInfo?.isDriver 
    ? getDriverConcentrationScore(currentActorInfo.actor) 
    : 0;
  const isDriverBlockedByRule = currentActorInfo?.isDriver 
    ? !canOperatorTakeAction(currentActorInfo.actor) 
    : false;

  const hasParticipants = chaseState.participants.length > 0;

  return (
    <div className="space-y-6">
      {/* Top Banner / HUD Header */}
      <div className="glass-card rounded-2xl p-6 border border-border/80 bg-gradient-to-r from-card/95 via-card/80 to-card/95 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--neon-orange)]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--neon-orange)] to-[var(--neon-red)] flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Gauge className="w-7 h-7 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-black tracking-wider uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                  Hot Pursuit // Система Погонь
                </h1>
                {hasParticipants && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-primary/20 text-primary border border-primary/40">
                    Раунд {chaseState.round}
                  </span>
                )}
                {chaseState.isFinished && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-destructive/20 text-destructive border border-destructive/50 flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5" /> ФИНАЛ: {chaseState.finishReason}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Линейный трекер погони Hot Pursuit DLC &amp; правила боя на транспорте Cyberpunk RED (Core p. 189–192)
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="default"
              size="sm"
              onClick={() => setAddVehicleModalOpen(true)}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить ТС</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setScenariosModalOpen(true)}
              className="gap-2 border-border hover:bg-secondary/80"
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>Шаблоны погони</span>
            </Button>

            {hasParticipants && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={rollAllInitiatives}
                  className="gap-2 border-primary/40 hover:bg-primary/20"
                >
                  <Dice5 className="w-4 h-4 text-primary" />
                  <span>Инициатива</span>
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  onClick={handleOpenEndRound}
                  className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold shadow-md shadow-orange-600/30"
                >
                  <FastForward className="w-4 h-4" />
                  <span>Конец раунда</span>
                </Button>

                {onSwitchToTacticalCombat && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSwitchToTacticalCombat}
                    className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    title="Перейти к тактической сетке боя"
                  >
                    <Swords className="w-3.5 h-3.5 text-primary" />
                    <span>В бой</span>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setClearConfirmOpen(true)}
                  title="Очистить погоню"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Subheader: Active Obstacle & Scenarios (Visible when participants exist) */}
        {hasParticipants && (
          <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-semibold">Быстрые сценарии:</span>
              {CHASE_SCENARIOS.slice(0, 3).map(scen => (
                <button
                  key={scen.id}
                  onClick={() => loadScenario(scen.id)}
                  className="px-2.5 py-1 rounded bg-secondary/80 hover:bg-secondary text-foreground hover:text-primary transition-colors text-xs"
                >
                  {scen.name.split(':')[0]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" /> Препятствие на дороге (СЛ):
              </span>
              <Input
                type="number"
                placeholder="Нет"
                value={chaseState.activeObstacleDc || ''}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value) : null;
                  setChaseState(prev => ({ ...prev, activeObstacleDc: val }));
                }}
                className="w-20 h-7 text-xs font-mono"
              />
              {chaseState.activeObstacleDc && (
                <span className="text-warning font-bold">СЛ {chaseState.activeObstacleDc}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===================== EMPTY STATE (WHEN NO PARTICIPANTS) ===================== */}
      {!hasParticipants && (
        <div className="space-y-6">
          <div className="text-center py-16 px-6 border-2 border-dashed border-border/80 rounded-2xl bg-card/30 backdrop-blur-xl shadow-xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto text-primary shadow-inner">
              <Gauge className="w-8 h-8 text-primary" />
            </div>
            
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-xl font-black uppercase tracking-wide text-foreground font-mono">
                Нет активной погони
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Добавьте транспортные средства участников, импортируйте персонажей из боя или выберите готовый сценарий погони.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                onClick={() => setAddVehicleModalOpen(true)}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить ТС и Водителя</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => setScenariosModalOpen(true)}
                className="gap-2 border-border/80 hover:bg-secondary/80 font-bold"
              >
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>Выбрать готовый шаблон</span>
              </Button>
            </div>
          </div>

          {/* Quick Scenario Cards Grid */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Готовые шаблоны сценариев погони Hot Pursuit:
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CHASE_SCENARIOS.map(scen => (
                <div
                  key={scen.id}
                  className="p-5 rounded-2xl bg-card/80 border border-border hover:border-primary/50 transition-all shadow-md space-y-3 flex flex-col justify-between group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                        {scen.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-secondary text-muted-foreground">
                        {scen.tag}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {scen.description}
                    </p>
                    <div className="text-[11px] font-mono text-muted-foreground/80 pt-1">
                      Участники: {scen.participants.map(p => `${p.vehicle.name} (${p.operator.name})`).join(' vs ')}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => loadScenario(scen.id)}
                    className="w-full gap-2 bg-secondary hover:bg-primary hover:text-black font-bold text-xs transition-colors"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>Запустить этот сценарий</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================== ACTIVE CHASE GRID & CONTROLS ===================== */}
      {hasParticipants && (
        <>
          {/* Visual Track Lane */}
          <div className="glass-card rounded-2xl p-6 border border-border/80 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-wide uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                    Линейная Сетка Преследования (Chase Grid)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Абстрактные клетки дистанции Hot Pursuit. 0 клеток = физический контакт. Разрыв &gt; 8 клеток = побег.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded bg-secondary font-mono">
                  Активных ТС: {chaseState.participants.filter(p => !p.vehicle.isDestroyed).length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto pb-4 pt-2">
              <div className="min-w-[900px]">
                {/* Cell headers with distance band markings */}
                <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: `repeat(${maxGridPosition + 1}, minmax(80px, 1fr))` }}>
                  {Array.from({ length: maxGridPosition + 1 }).map((_, cellIdx) => {
                    const rangeInfo = getRangeBandFromCells(cellIdx);
                    const isBreakaway = cellIdx > 8;
                    return (
                      <div 
                        key={cellIdx}
                        className={`text-center p-1.5 rounded-lg border text-xs font-mono transition-all ${
                          cellIdx === 0 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold' 
                            : isBreakaway
                            ? 'bg-destructive/10 border-destructive/30 text-destructive font-bold'
                            : 'bg-secondary/40 border-border/60 text-muted-foreground'
                        }`}
                      >
                        <div className="font-bold text-sm">Клетка {cellIdx}</div>
                        <div className="text-[10px] truncate">{rangeInfo.metersRange}</div>
                        {cellIdx === 0 && <div className="text-[9px] text-amber-400">В упор</div>}
                        {isBreakaway && <div className="text-[9px] text-destructive">Побег!</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Track Asphalt Surface */}
                <div 
                  className="relative rounded-2xl bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 border-2 border-border/80 p-4 min-h-[220px] shadow-inner"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.02) 40px, rgba(255,255,255,0.02) 80px)'
                  }}
                >
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-amber-500/20 pointer-events-none" />

                  <div className="grid gap-2 h-full" style={{ gridTemplateColumns: `repeat(${maxGridPosition + 1}, minmax(80px, 1fr))` }}>
                    {Array.from({ length: maxGridPosition + 1 }).map((_, cellIdx) => {
                      const vehiclesInCell = chaseState.participants.filter(p => p.gridPosition === cellIdx);
                      const isContact = vehiclesInCell.length > 1;

                      return (
                        <div 
                          key={cellIdx}
                          className={`relative flex flex-col items-center justify-center gap-2 p-1 rounded-xl transition-all border ${
                            isContact 
                              ? 'border-amber-500/60 bg-amber-500/5 shadow-lg shadow-amber-500/10' 
                              : 'border-transparent hover:border-border/40'
                          }`}
                        >
                          {isContact && (
                            <div className="absolute -top-2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500 text-black shadow">
                              Контакт!
                            </div>
                          )}

                          {vehiclesInCell.map(part => {
                            const IconComp = getVehicleIcon(part.vehicle.type);
                            const sdpPercent = Math.round((part.vehicle.currentSdp / part.vehicle.maxSdp) * 100);
                            const isHalfDamaged = part.vehicle.currentSdp < (part.vehicle.maxSdp / 2);
                            const isCurrentActorVehicle = currentActorInfo?.participant.id === part.id;

                            return (
                              <div
                                key={part.id}
                                className={`w-full max-w-[150px] p-2.5 rounded-xl border transition-all duration-300 relative group ${
                                  part.vehicle.isDestroyed
                                    ? 'bg-destructive/20 border-destructive/60 opacity-60'
                                    : part.isLeadVehicle
                                    ? 'bg-gradient-to-b from-amber-500/20 via-card to-card border-amber-500 shadow-lg shadow-amber-500/20 ring-1 ring-amber-500/50'
                                    : isCurrentActorVehicle
                                    ? 'bg-gradient-to-b from-primary/20 via-card to-card border-primary shadow-lg shadow-primary/20 ring-1 ring-primary/50'
                                    : 'bg-card/90 border-border/80 hover:border-border shadow'
                                }`}
                              >
                                {part.isLeadVehicle && (
                                  <div className="absolute -top-2 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500 text-black flex items-center gap-0.5 shadow">
                                    <Award className="w-2.5 h-2.5" /> ВЕДУЩИЙ
                                  </div>
                                )}

                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`p-1.5 rounded-lg ${part.isLeadVehicle ? 'bg-amber-500/20 text-amber-500' : 'bg-primary/20 text-primary'}`}>
                                    <IconComp className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold truncate leading-tight" title={part.vehicle.name}>
                                      {part.vehicle.name}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      {part.operator.name}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-1 mb-1.5">
                                  <div className="flex justify-between text-[10px] font-mono">
                                    <span className="text-muted-foreground">ПСП:</span>
                                    <span className={`font-bold ${sdpPercent > 50 ? 'text-emerald-400' : sdpPercent > 25 ? 'text-amber-400' : 'text-rose-400'}`}>
                                      {part.vehicle.currentSdp}/{part.vehicle.maxSdp}
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                                    <div 
                                      className={`h-full transition-all duration-300 ${
                                        sdpPercent > 50 ? 'bg-emerald-500' : sdpPercent > 25 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${sdpPercent}%` }}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-1 text-[10px] mb-2 font-mono">
                                  <span className="px-1.5 py-0.5 rounded bg-secondary flex items-center gap-1" title="Броня ТС (SP)">
                                    <Shield className="w-3 h-3 text-cyan-400" />
                                    SP {part.vehicle.armorSp}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${isHalfDamaged ? 'bg-amber-500/20 text-amber-400' : 'bg-secondary'}`} title="Боевая скорость">
                                    <Gauge className="w-3 h-3" />
                                    {part.vehicle.combatSpeed} СКО
                                  </span>
                                </div>

                                {part.vehicle.isOutOfControl && (
                                  <div className="mb-1.5 px-1 py-0.5 rounded text-[9px] font-bold bg-destructive/20 text-destructive border border-destructive/40 text-center animate-pulse">
                                    Вне контроля!
                                  </div>
                                )}

                                {isHalfDamaged && !part.vehicle.isDestroyed && (
                                  <div className="mb-1.5 px-1 py-0.5 rounded text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/30 text-center">
                                    -1 СКО (ПСП &lt; 50%)
                                  </div>
                                )}

                                <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => manualMoveVehicle(part.id, -1)}
                                      className="w-5 h-5 rounded hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground text-xs"
                                      title="Сдвинуть назад"
                                    >
                                      -1
                                    </button>
                                    <button
                                      onClick={() => manualMoveVehicle(part.id, 1)}
                                      className="w-5 h-5 rounded hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground text-xs"
                                      title="Сдвинуть вперёд"
                                    >
                                      +1
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => toggleOutOfControl(part.id)}
                                      className={`w-5 h-5 rounded flex items-center justify-center ${part.vehicle.isOutOfControl ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
                                      title="Потеря контроля"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleSetLead(part.id)}
                                      className={`w-5 h-5 rounded flex items-center justify-center ${part.isLeadVehicle ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'}`}
                                      title="Сделать ведущим ТС"
                                    >
                                      <Award className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleRemoveParticipant(part.id)}
                                      className="w-5 h-5 rounded hover:bg-destructive/20 flex items-center justify-center text-muted-foreground hover:text-destructive"
                                      title="Удалить ТС"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===================== RANGE RADAR & WEAPON DV HELPER ===================== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-card rounded-2xl p-6 border border-border/80 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Crosshair className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold tracking-wide uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                      Тактический Радар Дистанции &amp; СЛ Оружия
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Конверсия клеток погони Hot Pursuit в реальную дальность (метры) и СЛ стрельбы
                    </p>
                  </div>
                </div>

                {chaseState.participants.length >= 2 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-semibold">ТС А:</span>
                    <select
                      value={selectedPair.aId}
                      onChange={(e) => setSelectedPair(prev => ({ ...prev, aId: e.target.value }))}
                      className="bg-secondary text-foreground text-xs rounded-lg px-2 py-1 border border-border"
                    >
                      {chaseState.participants.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.vehicle.name}
                        </option>
                      ))}
                    </select>

                    <span className="text-muted-foreground font-semibold">vs ТС Б:</span>
                    <select
                      value={selectedPair.bId}
                      onChange={(e) => setSelectedPair(prev => ({ ...prev, bId: e.target.value }))}
                      className="bg-secondary text-foreground text-xs rounded-lg px-2 py-1 border border-border"
                    >
                      {chaseState.participants.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.vehicle.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {currentRangeBand ? (
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                    currentRangeBand.diff === 0 
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' 
                      : currentRangeBand.diff > 8
                      ? 'bg-destructive/10 border-destructive/40 text-destructive'
                      : 'bg-secondary/40 border-border/80'
                  }`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase font-mono tracking-wider font-bold">
                          Дистанция:
                        </span>
                        <span className="text-lg font-black font-mono">
                          {currentRangeBand.diff} {currentRangeBand.diff === 1 ? 'клетка' : currentRangeBand.diff < 5 ? 'клетки' : 'клеток'} ({currentRangeBand.info.metersRange})
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {currentRangeBand.info.description}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {currentRangeBand.info.isRamPossible && (
                        <Button
                          size="sm"
                          onClick={() => setRamModalOpen(true)}
                          className="bg-amber-500 hover:bg-amber-600 text-black font-bold gap-2 shadow"
                        >
                          <Zap className="w-4 h-4" />
                          <span>Таран (Ram СЛ 17)</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWeakPointModalOpen(true)}
                        className="border-primary/40 hover:bg-primary/20 text-primary gap-1.5"
                      >
                        <Target className="w-4 h-4" />
                        <span>Прицельный огонь (-8)</span>
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground text-left">
                          <th className="py-2 px-3">Тип Оружия</th>
                          <th className="py-2 px-3">Базовая СЛ</th>
                          <th className="py-2 px-3">По узлам (-8)</th>
                          <th className="py-2 px-3">Эффект пробития</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        <tr>
                          <td className="py-2 px-3 font-semibold text-foreground">Пистолет</td>
                          <td className="py-2 px-3 font-bold text-primary">СЛ {currentRangeBand.info.dvRecommendation.pistol}</td>
                          <td className="py-2 px-3 text-muted-foreground">СЛ {currentRangeBand.info.dvRecommendation.pistol} (-8)</td>
                          <td className="py-2 px-3 text-muted-foreground">Урон сквозь SP x2</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-semibold text-foreground">Дробовик</td>
                          <td className="py-2 px-3 font-bold text-primary">СЛ {currentRangeBand.info.dvRecommendation.shotgunSlug}</td>
                          <td className="py-2 px-3 text-muted-foreground">СЛ {currentRangeBand.info.dvRecommendation.shotgunSlug} (-8)</td>
                          <td className="py-2 px-3 text-muted-foreground">Урон сквозь SP x2</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-semibold text-foreground">ПП (SMG)</td>
                          <td className="py-2 px-3 font-bold text-primary">СЛ {currentRangeBand.info.dvRecommendation.smg}</td>
                          <td className="py-2 px-3 text-muted-foreground">СЛ {currentRangeBand.info.dvRecommendation.smg} (-8)</td>
                          <td className="py-2 px-3 text-muted-foreground">Урон сквозь SP x2</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-semibold text-foreground">Штурмовая винтовка</td>
                          <td className="py-2 px-3 font-bold text-primary">СЛ {currentRangeBand.info.dvRecommendation.ar}</td>
                          <td className="py-2 px-3 text-muted-foreground">СЛ {currentRangeBand.info.dvRecommendation.ar} (-8)</td>
                          <td className="py-2 px-3 text-muted-foreground">Урон сквозь SP x2</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-semibold text-foreground">Снайперская винтовка</td>
                          <td className="py-2 px-3 font-bold text-primary">СЛ {currentRangeBand.info.dvRecommendation.sniper}</td>
                          <td className="py-2 px-3 text-muted-foreground">СЛ {currentRangeBand.info.dvRecommendation.sniper} (-8)</td>
                          <td className="py-2 px-3 text-muted-foreground">Урон сквозь SP x2</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-semibold text-foreground">Ракетница</td>
                          <td className="py-2 px-3 font-bold text-primary">СЛ {currentRangeBand.info.dvRecommendation.rocket}</td>
                          <td className="py-2 px-3 text-muted-foreground">Взрывной урон</td>
                          <td className="py-2 px-3 text-muted-foreground">Полный урон по корпусу</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-xl">
                  Добавьте второе ТС для расчета относительной дистанции стрельбы.
                </div>
              )}
            </div>

            {/* Right Col: Initiative & Turn Order Tracker */}
            <div className="glass-card rounded-2xl p-6 border border-border/80 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h3 className="text-base font-bold tracking-wide uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                    Очередь Ходов
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={prevTurn} title="Предыдущий ход">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={nextTurn} title="Следующий ход">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {chaseState.initiativeOrder.map(actId => {
                  const actorInfo = allActors.find(a => a.actor.id === actId);
                  if (!actorInfo) return null;
                  const isCurrent = chaseState.currentTurnActorId === actId;

                  return (
                    <div
                      key={actId}
                      onClick={() => setChaseState(prev => ({ ...prev, currentTurnActorId: actId }))}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        isCurrent
                          ? 'bg-primary/20 border-primary ring-1 ring-primary/40 shadow-md'
                          : 'bg-card/70 border-border/60 hover:bg-secondary/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono font-bold ${
                          isCurrent ? 'bg-primary text-black' : 'bg-secondary text-muted-foreground'
                        }`}>
                          {actorInfo.actor.initiative}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate flex items-center gap-1.5">
                            <span>{actorInfo.actor.name}</span>
                            {actorInfo.isDriver ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-400 font-normal">
                                Водитель
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-secondary text-muted-foreground font-normal">
                                Пассажир
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {actorInfo.vehicle.name} (Клетка {actorInfo.participant.gridPosition})
                          </div>
                        </div>
                      </div>

                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary text-black animate-pulse">
                          Ходит
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ===================== ACTIVE TURN ACTOR CONTROLS ===================== */}
          {currentActorInfo && (
            <div className="glass-card rounded-2xl p-6 border-2 border-primary/50 bg-gradient-to-br from-card/95 via-card/90 to-card/95 shadow-2xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-[var(--neon-orange)] flex items-center justify-center text-black font-black text-lg shadow">
                    {currentActorInfo.actor.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
                        Ход: {currentActorInfo.actor.name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${currentActorInfo.isDriver ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-secondary text-muted-foreground'}`}>
                        {currentActorInfo.isDriver ? 'Водитель / Оператор' : 'Пассажир'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Транспорт: <span className="font-semibold text-foreground">{currentActorInfo.vehicle.name}</span> | Позиция: <span className="font-mono font-bold text-primary">Клетка {currentActorInfo.participant.gridPosition}</span> | РЕФ {currentActorInfo.actor.ref}, Вождение {currentActorInfo.actor.driveSkill}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextTurn}
                    className="gap-2 border-primary/40 text-primary hover:bg-primary/20"
                  >
                    <span>Завершить ход</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* 4.1. Ограничение водителя (REF + Drive Check) */}
              {currentActorInfo.isDriver ? (
                <div className="space-y-4">
                  {isDriverBlockedByRule ? (
                    <div className="p-4 rounded-xl bg-destructive/15 border-2 border-destructive text-destructive space-y-2">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <AlertTriangle className="w-5 h-5 text-destructive animate-bounce" />
                        <span>ВОДИТЕЛЬ ПОЛНОСТЬЮ СКОНЦЕНТРИРОВАН НА РУЛЕНИИ (СУММА &lt; 9)</span>
                      </div>
                      <p className="text-xs leading-relaxed">
                        Правило Hot Pursuit (п. 4.1): сумма РЕФ ({currentActorInfo.actor.ref}) + Навык вождения ({currentActorInfo.actor.driveSkill}) + Бонусы ({currentActorInfo.actor.driveBonus}) = <strong className="font-mono">{driverConcentrationScore}</strong> (меньше 9).
                        Водитель вынужден тратить все силы на удержание машины в потоке. <strong>Стандартные действия атаки заблокированы!</strong>
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Контроль стабилен: РЕФ + Вождение + Бонус = <strong className="font-mono">{driverConcentrationScore}</strong> (≥ 9).</span>
                      </div>
                      <div className="text-muted-foreground">
                        {!currentActorInfo.actor.hasInterfacePlugs && (
                          <span className="text-amber-400 font-medium">⚠️ 1 рука занята рулём (нет нейроинтерфейса)</span>
                        )}
                        {currentActorInfo.actor.tempDriveBonus ? (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
                            +{currentActorInfo.actor.tempDriveBonus} бонус от пассажира
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Driver Actions Grid */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Действия Водителя в свой ход:
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Flame className="w-4 h-4 text-orange-400" />
                            <span className="font-bold text-xs">Активация NOS</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                            СЛ 13
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Мгновенно даёт <strong>+1 клетку вперёд</strong>. Провал броска = потеря контроля!
                        </p>
                        <Button
                          size="sm"
                          onClick={executeNos}
                          disabled={!currentActorInfo.vehicle.hasNos}
                          className="w-full gap-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          <span>{currentActorInfo.vehicle.hasNos ? 'Врубить закись (NOS)' : 'NOS отсутствует'}</span>
                        </Button>
                      </div>

                      <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="font-bold text-xs">Маневр Тарана (Ram)</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            СЛ 17
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Требует 0 клеток разницы. Наносит 6d6 урона обоим ТС и вызывает Whiplash у пассажиров!
                        </p>
                        <Button
                          size="sm"
                          onClick={() => setRamModalOpen(true)}
                          className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Подготовить таран</span>
                        </Button>
                      </div>

                      <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Crosshair className="w-4 h-4 text-cyan-400" />
                            <span className="font-bold text-xs">Огонь по узлам</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                            Штраф -8
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Прицельный выстрел по узлам: урон сквозь броню ТС удваивается (x2)!
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isDriverBlockedByRule}
                          onClick={() => setWeakPointModalOpen(true)}
                          className="w-full gap-2 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 text-xs"
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                          <span>Калькулятор узлов</span>
                        </Button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="text-xs font-semibold text-muted-foreground mb-2">
                        Стандартные манёвры вождения (Core Rulebook p. 192):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {MANEUVER_LIST.filter(m => m.id !== 'NOS_ACTIVATION' && m.id !== 'RAM').map(m => (
                          <Button
                            key={m.id}
                            size="sm"
                            variant="secondary"
                            onClick={() => executeManeuver(m.id)}
                            className="text-xs font-medium gap-1.5 hover:border-primary/50"
                            title={m.description}
                          >
                            <span>{m.name}</span>
                            <span className="text-[10px] font-mono text-primary font-bold">СЛ {m.dc}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Passenger Actions */
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs">
                    Пассажир может стрелять из окон/люка, помогать водителю с навигацией или готовиться к абордажу.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-xs">Помощь водителю</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                          СЛ 13
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Бросок Внимания против СЛ 13 даёт водителю <strong>+1 бонус</strong> к маневру или позиционированию!
                      </p>
                      <Button
                        size="sm"
                        onClick={executeComplementaryCheck}
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Помочь водителю (+1)</span>
                      </Button>
                    </div>

                    <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Crosshair className="w-4 h-4 text-cyan-400" />
                          <span className="font-bold text-xs">Огонь по узлам</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                          Штраф -8
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Прицельный огонь по колесам/двигателю: пробивающий урон удваивается.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWeakPointModalOpen(true)}
                        className="w-full gap-2 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20 text-xs"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>Расчет выстрела</span>
                      </Button>
                    </div>

                    <div className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Swords className="w-4 h-4 text-rose-400" />
                          <span className="font-bold text-xs">Абордаж (Boarding)</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">
                          Дист. 0
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Прыжок на корпус вражеского ТС на полной скорости (Атлетика против СЛ 17).
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const d10 = rollD10Exploding();
                          const mod = currentActorInfo.actor.dex + 4;
                          const total = d10.total + mod;
                          const success = total >= 17;
                          if (success) {
                            toast.success(`Успешный прыжок на вражеское ТС! (${total} vs СЛ 17)`);
                          } else {
                            toast.error(`Провал абордажа! Пассажир срывается с ТС! (${total} vs СЛ 17)`);
                          }
                          addLog({
                            actorName: currentActorInfo.actor.name,
                            vehicleName: currentActorInfo.vehicle.name,
                            actionType: 'MANEUVER',
                            title: 'Попытка абордажа',
                            details: success ? 'Успешно зацепился за корпус врага!' : 'Сорвался при прыжке на скорости!',
                            roll: {
                              d10: d10.total,
                              modifier: mod,
                              total,
                              targetDc: 17,
                              success,
                              breakdown: `[ЛВК/Атлетика +${mod}] + [d10: ${d10.breakdown}] = ${total}`
                            }
                          });
                        }}
                        className="w-full gap-2 text-xs"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        <span>Бросок на абордаж (СЛ 17)</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================== CHASE EVENT LOG ===================== */}
          <div className="glass-card rounded-2xl p-6 border border-border/80 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-wide uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                    Журнал Событий Погони (Chase Log)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Хронология манёвров, ускорений, таранов и результатов бросков
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const text = chaseState.logs.map(l => `[${l.timestamp}] (Р.${l.round}) ${l.title}: ${l.details}`).join('\n');
                  navigator.clipboard.writeText(text);
                  toast.success('Журнал скопирован в буфер обмена!');
                }}
                className="text-xs gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Копировать журнал</span>
              </Button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {chaseState.logs.map(log => (
                <div 
                  key={log.id} 
                  className="p-3 rounded-xl border border-border/60 bg-card/60 text-xs space-y-1 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {log.timestamp}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-secondary">
                        Р.{log.round}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                        log.actionType === 'RAM' ? 'bg-amber-500/20 text-amber-400' :
                        log.actionType === 'NOS' ? 'bg-orange-500/20 text-orange-400' :
                        log.actionType === 'TERMINATION' ? 'bg-destructive/20 text-destructive' :
                        log.actionType === 'COMPLEMENTARY' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-primary/20 text-primary'
                      }`}>
                        {log.actionType}
                      </span>
                      <span className="font-bold text-foreground">
                        {log.title}
                      </span>
                    </div>

                    {log.roll && (
                      <span className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                        log.roll.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {log.roll.total} vs СЛ {log.roll.targetDc} ({log.roll.success ? 'УСПЕХ' : 'ПРОВАЛ'})
                      </span>
                    )}
                  </div>

                  <p className="text-muted-foreground leading-relaxed pl-1">
                    {log.details}
                  </p>

                  {log.roll?.breakdown && (
                    <div className="text-[10px] font-mono text-muted-foreground/80 pl-1">
                      Бросок: {log.roll.breakdown}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ===================== MODAL: SCENARIOS SELECTOR ===================== */}
      {scenariosModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-card rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4 border border-border shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide">
                    Шаблоны Сценариев Погонь
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Официальные и атмосферные пресеты для быстрого старта погони
                  </p>
                </div>
              </div>
              <button onClick={() => setScenariosModalOpen(false)} className="p-1 hover:bg-secondary rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {CHASE_SCENARIOS.map(scen => (
                <div
                  key={scen.id}
                  className="p-4 rounded-xl border border-border/80 bg-card hover:border-primary/50 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                        {scen.name}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-secondary text-muted-foreground">
                        {scen.tag}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {scen.description}
                    </p>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      ТС: {scen.participants.map(p => p.vehicle.name).join(' vs ')}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => loadScenario(scen.id)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shrink-0"
                  >
                    Запустить
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setScenariosModalOpen(false)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: CLEAR CONFIRMATION ===================== */}
      {clearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full space-y-4 border border-destructive/50 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/20 text-destructive flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold uppercase text-foreground">
                  Очистить погоню?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Все участники и журнал будут сброшены.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setClearConfirmOpen(false)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearChase}
                className="font-bold"
              >
                Очистить всё
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: END OF ROUND POSITIONING ===================== */}
      {endRoundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-card rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto space-y-6 border border-border/80 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow">
                  <FastForward className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
                    Фаза Позиционирования (Конец Раунда {chaseState.round})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Каждый оператор выбирает режим движения. Ускорение требует проверки Вождения против эффективной СЛ скорости!
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEndRoundModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {chaseState.participants.map(part => {
                const req = calculatePositioningDc(part.vehicle);
                const currentDecision = endRoundDecisions[part.id] || { choice: 'ACCELERATE' };

                return (
                  <div 
                    key={part.id}
                    className={`p-4 rounded-xl border space-y-3 ${
                      part.vehicle.isDestroyed 
                        ? 'opacity-50 bg-secondary/20 border-border/40' 
                        : req.outOfControlCrash
                        ? 'bg-destructive/15 border-destructive'
                        : 'bg-card/90 border-border/80 shadow-md'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">
                          {part.vehicle.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          (Водитель: {part.operator.name}, Позиция: Клетка {part.gridPosition})
                        </span>
                        {part.isLeadVehicle && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400">
                            ВЕДУЩИЙ
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="px-2 py-0.5 rounded bg-secondary">
                          ПСП: {part.vehicle.currentSdp}/{part.vehicle.maxSdp}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-bold ${req.isDamaged ? 'bg-amber-500/20 text-amber-400' : 'bg-secondary'}`}>
                          СКО: {req.effectiveSpeed} (СЛ {req.dc})
                        </span>
                      </div>
                    </div>

                    {req.outOfControlCrash ? (
                      <div className="p-3 rounded-lg bg-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                        <Skull className="w-4 h-4" />
                        <span>КРИТИЧЕСКОЕ КРУШЕНИЕ: Скорость упала ниже 8 СКО из-за повреждений структуры. Машина разбивается!</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                        <label className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          currentDecision.choice === 'ACCELERATE'
                            ? 'bg-primary/20 border-primary ring-1 ring-primary/40'
                            : 'bg-secondary/30 border-border hover:bg-secondary/60'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs">Ускорение (+1)</span>
                            <input
                              type="radio"
                              name={`choice-${part.id}`}
                              checked={currentDecision.choice === 'ACCELERATE'}
                              onChange={() => setEndRoundDecisions(prev => ({
                                ...prev,
                                [part.id]: { ...prev[part.id], choice: 'ACCELERATE' }
                              }))}
                              className="accent-primary"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mb-2">
                            Продвижение вперёд. Чек Вождения против <strong>СЛ {req.dc}</strong>.
                          </p>

                          {currentDecision.choice === 'ACCELERATE' && (
                            <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRollEndRoundCheck(part.id)}
                                  className="h-7 text-xs gap-1 border-primary/40 hover:bg-primary/20"
                                >
                                  <Dice5 className="w-3.5 h-3.5 text-primary" />
                                  <span>Бросить</span>
                                </Button>
                                <Input
                                  type="number"
                                  placeholder="Итог"
                                  value={currentDecision.roll !== undefined ? currentDecision.roll : ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value) : undefined;
                                    setEndRoundDecisions(prev => ({
                                      ...prev,
                                      [part.id]: { ...prev[part.id], roll: val }
                                    }));
                                  }}
                                  className="h-7 text-xs font-mono w-20"
                                />
                              </div>
                              {currentDecision.roll !== undefined && (
                                <div className={`text-[10px] font-mono font-bold ${
                                  currentDecision.roll >= req.dc ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                  {currentDecision.roll >= req.dc ? `✓ Успех (+1 клетка)` : `✗ Провал (на месте)`}
                                </div>
                              )}
                            </div>
                          )}
                        </label>

                        <label className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          currentDecision.choice === 'MAINTAIN'
                            ? 'bg-primary/20 border-primary ring-1 ring-primary/40'
                            : 'bg-secondary/30 border-border hover:bg-secondary/60'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs">Удержание (0)</span>
                            <input
                              type="radio"
                              name={`choice-${part.id}`}
                              checked={currentDecision.choice === 'MAINTAIN'}
                              onChange={() => setEndRoundDecisions(prev => ({
                                ...prev,
                                [part.id]: { ...prev[part.id], choice: 'MAINTAIN', roll: undefined }
                              }))}
                              className="accent-primary"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Поддержание текущей скорости. 0 проверок, позиция сохраняется.
                          </p>
                        </label>

                        <label className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          currentDecision.choice === 'DECELERATE'
                            ? 'bg-primary/20 border-primary ring-1 ring-primary/40'
                            : 'bg-secondary/30 border-border hover:bg-secondary/60'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs">Замедление (-1)</span>
                            <input
                              type="radio"
                              name={`choice-${part.id}`}
                              checked={currentDecision.choice === 'DECELERATE'}
                              onChange={() => setEndRoundDecisions(prev => ({
                                ...prev,
                                [part.id]: { ...prev[part.id], choice: 'DECELERATE', roll: undefined }
                              }))}
                              className="accent-primary"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Сброс газа. Смещение на 1 клетку назад, без проверки навыка.
                          </p>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
              <Button
                variant="outline"
                onClick={() => setEndRoundModalOpen(false)}
              >
                Отмена
              </Button>

              <Button
                onClick={applyEndRoundPositioning}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold gap-2 shadow-lg shadow-orange-600/30"
              >
                <Check className="w-4 h-4" />
                <span>Применить и начать раунд {chaseState.round + 1}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: RAM ATTACK ===================== */}
      {ramModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-card rounded-2xl p-6 max-w-lg w-full space-y-5 border border-border shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide">
                    Манёвр Тарана (Ram СЛ 17)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Требуется 0 клеток дистанции между ТС
                  </p>
                </div>
              </div>
              <button onClick={() => setRamModalOpen(false)} className="p-1 hover:bg-secondary rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-secondary/40 text-xs space-y-1">
                <div className="font-semibold text-foreground">Атакующее ТС:</div>
                <div className="text-muted-foreground">
                  {currentActorInfo?.vehicle.name} (Водитель: {currentActorInfo?.actor.name})
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Выберите цель тарана (находящуюся на той же клетке {currentActorInfo?.participant.gridPosition}):
                </label>
                <div className="space-y-2">
                  {chaseState.participants
                    .filter(p => p.id !== currentActorInfo?.participant.id && p.gridPosition === currentActorInfo?.participant.gridPosition)
                    .map(target => (
                      <button
                        key={target.id}
                        onClick={() => executeRam(target.id)}
                        className="w-full p-3 rounded-xl border border-border/80 bg-card hover:bg-amber-500/10 hover:border-amber-500/40 text-left transition-all flex items-center justify-between group"
                      >
                        <div>
                          <div className="font-bold text-xs text-foreground group-hover:text-amber-400">
                            {target.vehicle.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Водитель: {target.operator.name} | SDP: {target.vehicle.currentSdp}/{target.vehicle.maxSdp} | SP: {target.vehicle.armorSp}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded bg-amber-500 text-black text-[10px] font-bold">
                          Таранить!
                        </span>
                      </button>
                    ))}

                  {chaseState.participants.filter(p => p.id !== currentActorInfo?.participant.id && p.gridPosition === currentActorInfo?.participant.gridPosition).length === 0 && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs text-center">
                      На клетке {currentActorInfo?.participant.gridPosition} нет других ТС для тарана! Сначала сблизьтесь на дистанцию 0.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] space-y-1">
                <div className="font-bold">⚠️ Последствия тарана (Core Rulebook):</div>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Оба ТС получают по 6d6 урона (с учетом брони SP).</li>
                  <li>Все водители и пассажиры получают травму «Травма трахеи» (Whiplash: -2 ко всем действиям).</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: WEAK POINTS CALCULATOR ===================== */}
      {weakPointModalOpen && (
        <WeakPointDialog 
          participants={chaseState.participants}
          onClose={() => setWeakPointModalOpen(false)}
          onApplyDamage={(participantId, damage, spAblation) => {
            adjustSdp(participantId, -damage);
            if (spAblation > 0) adjustArmorSp(participantId, -spAblation);
            toast.success(`Нанесено ${damage} урона по узлам ТС!`);
            addLog({
              actionType: 'ATTACK',
              title: 'Прицельный выстрел по узлам',
              details: `Нанесено ${damage} критического урона по SDP! Броня ТС снижена на ${spAblation}.`
            });
            setWeakPointModalOpen(false);
          }}
        />
      )}

      {/* ===================== MODAL: ADD VEHICLE ===================== */}
      {addVehicleModalOpen && (
        <AddVehicleDialog
          encounterParticipants={encounterParticipants}
          onClose={() => setAddVehicleModalOpen(false)}
          onAddVehicle={(newPart) => {
            const newLogEntry: ChaseLogEntry = {
              id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toLocaleTimeString(),
              round: chaseState.round,
              actionType: 'STATUS',
              title: 'Новое ТС в погоне',
              details: `${newPart.vehicle.name} (Водитель: ${newPart.operator.name}) выезжает на клетку ${newPart.gridPosition}.`
            };

            setChaseState(prev => {
              const updated = [...prev.participants, newPart];
              const newInitiativeOrder = [
                ...prev.initiativeOrder,
                newPart.operator.id,
                ...newPart.passengers.map(p => p.id)
              ];
              return {
                ...prev,
                participants: updated,
                initiativeOrder: newInitiativeOrder,
                currentTurnActorId: prev.currentTurnActorId || newPart.operator.id,
                logs: [newLogEntry, ...prev.logs.slice(0, 99)]
              };
            });

            setSelectedPair(prev => {
              if (!prev.aId) return { aId: newPart.id, bId: '' };
              if (!prev.bId && prev.aId !== newPart.id) return { aId: prev.aId, bId: newPart.id };
              return prev;
            });

            toast.success(`Транспорт «${newPart.vehicle.name}» успешно добавлен в погоню!`);
            setAddVehicleModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

// ===================== SUBCOMPONENTS =====================

// Weak Point Shot Helper Dialog
interface WeakPointDialogProps {
  participants: ChaseParticipant[];
  onClose: () => void;
  onApplyDamage: (participantId: string, damage: number, spAblation: number) => void;
}

const WeakPointDialog: React.FC<WeakPointDialogProps> = ({ participants, onClose, onApplyDamage }) => {
  const [targetId, setTargetId] = useState<string>(participants[0]?.id || '');
  const [rawDamage, setRawDamage] = useState<number>(15);

  const targetPart = participants.find(p => p.id === targetId);
  const targetSp = targetPart?.vehicle.armorSp || 0;

  const result = calculateWeakPointShot(rawDamage, targetSp);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="glass-card rounded-2xl p-6 max-w-md w-full space-y-4 border border-border shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold uppercase tracking-wide">
              Прицельный огонь по уязвимым узлам
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold block mb-1">Целевое ТС:</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full bg-secondary text-foreground text-xs rounded-lg p-2 border border-border"
            >
              {participants.map(p => (
                <option key={p.id} value={p.id}>
                  {p.vehicle.name} (SP: {p.vehicle.armorSp}, SDP: {p.vehicle.currentSdp})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1">Сырой урон оружия (до вычета брони):</label>
            <Input
              type="number"
              value={rawDamage}
              onChange={(e) => setRawDamage(parseInt(e.target.value) || 0)}
              className="text-xs font-mono"
            />
          </div>

          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 space-y-1">
            <div className="font-bold">Правило расчёта (ТЗ п. 4.4):</div>
            <div>Штраф к попаданию: <strong>-8 к проверке атаки</strong>.</div>
            <div>Броня ТС (SP): <strong>{targetSp}</strong>.</div>
            <div className="text-foreground pt-1 border-t border-cyan-500/20">
              {result.message}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            size="sm"
            onClick={() => onApplyDamage(targetId, result.damageTaken, result.spAblation)}
            disabled={!result.penetrated}
            className="bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
          >
            Применить {result.damageTaken} урона
          </Button>
        </div>
      </div>
    </div>
  );
};

// Add Vehicle Dialog
interface AddVehicleDialogProps {
  encounterParticipants?: Participant[];
  onClose: () => void;
  onAddVehicle: (participant: ChaseParticipant) => void;
}

const AddVehicleDialog: React.FC<AddVehicleDialogProps> = ({ encounterParticipants = [], onClose, onAddVehicle }) => {
  const firstPreset = VEHICLE_PRESETS[0];
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [vehicleName, setVehicleName] = useState<string>(firstPreset.vehicle.name);
  const [vehicleType, setVehicleType] = useState<Vehicle['type']>(firstPreset.vehicle.type);
  const [maxSdp, setMaxSdp] = useState<number>(firstPreset.vehicle.maxSdp);
  const [armorSp, setArmorSp] = useState<number>(firstPreset.vehicle.armorSp);
  const [combatSpeed, setCombatSpeed] = useState<number>(firstPreset.vehicle.combatSpeed);
  const [hasNos, setHasNos] = useState<boolean>(firstPreset.vehicle.hasNos);
  const [hasBulletproofGlass, setHasBulletproofGlass] = useState<boolean>(firstPreset.vehicle.hasBulletproofGlass);
  const [gridPosition, setGridPosition] = useState<number>(0);
  const [isLeadVehicle, setIsLeadVehicle] = useState<boolean>(false);

  // Driver details
  const [driverName, setDriverName] = useState<string>('Водитель');
  const [driverRef, setDriverRef] = useState<number>(7);
  const [driverDriveSkill, setDriverDriveSkill] = useState<number>(5);
  const [driverBonus, setDriverBonus] = useState<number>(0);
  const [hasInterfacePlugs, setHasInterfacePlugs] = useState<boolean>(false);

  // Passengers list
  const [passengers, setPassengers] = useState<CharacterActor[]>([]);
  const [customPassName, setCustomPassName] = useState<string>('');
  const [customPassRef, setCustomPassRef] = useState<number>(6);

  const handleSelectPreset = (idx: number) => {
    setSelectedPresetIndex(idx);
    const p = VEHICLE_PRESETS[idx];
    if (p) {
      setVehicleName(p.vehicle.name);
      setVehicleType(p.vehicle.type);
      setMaxSdp(p.vehicle.maxSdp);
      setArmorSp(p.vehicle.armorSp);
      setCombatSpeed(p.vehicle.combatSpeed);
      setHasNos(p.vehicle.hasNos);
      setHasBulletproofGlass(p.vehicle.hasBulletproofGlass);
    }
  };

  const handleImportEncounterCombatant = (combId: string) => {
    const c = encounterParticipants.find(p => p.id === combId);
    if (c) {
      setDriverName(c.name);
      setDriverRef(c.ref || 7);
      setDriverDriveSkill(c.skills?.['Drive Land Vehicle'] || c.skills?.['Drive Sea Vehicle'] || c.skills?.['Pilot Air Vehicle'] || 5);
      setHasInterfacePlugs(c.cyberware?.some(cw => cw.name.toLowerCase().includes('interface plug')) || false);
      toast.success(`Данные водителя ${c.name} импортированы!`);
    }
  };

  const handleAddPassengerFromEncounter = (combId: string) => {
    const c = encounterParticipants.find(p => p.id === combId);
    if (c) {
      const newPassenger: CharacterActor = {
        id: `pass-${c.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: c.name,
        ref: c.ref || 6,
        dex: c.dex || c.ref || 6,
        driveSkill: c.skills?.['Drive Land Vehicle'] || 2,
        driveBonus: 0,
        hasInterfacePlugs: false,
        initiative: (c.ref || 6) + rollDice(1, 10),
        role: c.role || 'Passenger',
        isPC: c.isPC
      };
      setPassengers(prev => [...prev, newPassenger]);
      toast.success(`${c.name} добавлен в пассажиры!`);
    }
  };

  const handleAddPassengerFromPreset = (presetName: string) => {
    const ap = ACTOR_PRESETS.find(a => a.name === presetName);
    if (ap) {
      const newPassenger: CharacterActor = {
        id: `pass-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: ap.actor.name,
        ref: ap.actor.ref,
        dex: ap.actor.dex,
        driveSkill: ap.actor.driveSkill,
        driveBonus: ap.actor.driveBonus,
        hasInterfacePlugs: ap.actor.hasInterfacePlugs,
        initiative: ap.actor.ref + rollDice(1, 10),
        role: ap.actor.role || 'Passenger',
        isPC: false
      };
      setPassengers(prev => [...prev, newPassenger]);
      toast.success(`Пассажир ${ap.actor.name} добавлен!`);
    }
  };

  const handleAddCustomPassenger = () => {
    const pName = customPassName.trim() || `Пассажир ${passengers.length + 1}`;
    const newPassenger: CharacterActor = {
      id: `pass-custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: pName,
      ref: customPassRef || 6,
      dex: customPassRef || 6,
      driveSkill: 2,
      driveBonus: 0,
      hasInterfacePlugs: false,
      initiative: (customPassRef || 6) + rollDice(1, 10),
      role: 'Passenger',
      isPC: false
    };
    setPassengers(prev => [...prev, newPassenger]);
    setCustomPassName('');
    toast.success(`${pName} добавлен в пассажиры!`);
  };

  const handleCreate = () => {
    const finalVehicleName = vehicleName.trim() || 'Транспорт';
    const finalDriverName = driverName.trim() || 'Водитель';

    const newPart: ChaseParticipant = {
      id: `chase-part-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      gridPosition: Math.max(0, gridPosition),
      isLeadVehicle,
      hasUsedActionThisTurn: false,
      isDrivingOneHanded: !hasInterfacePlugs,
      vehicle: {
        id: `v-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: finalVehicleName,
        type: vehicleType,
        maxSdp: Math.max(1, maxSdp),
        currentSdp: Math.max(1, maxSdp),
        armorSp: Math.max(0, armorSp),
        combatSpeed,
        hasNos,
        hasBulletproofGlass,
        isDestroyed: false,
        isOutOfControl: false
      },
      operator: {
        id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: finalDriverName,
        ref: driverRef,
        dex: Math.max(1, driverRef - 1),
        driveSkill: driverDriveSkill,
        driveBonus: driverBonus,
        hasInterfacePlugs,
        initiative: driverRef + rollDice(1, 10),
        role: 'Driver'
      },
      passengers
    };

    onAddVehicle(newPart);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="glass-card rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-5 border border-border shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold uppercase tracking-wide">
                Добавить Транспортное Средство в Погоню
              </h3>
              <p className="text-xs text-muted-foreground">
                Выберите официальный пресет или настройте кастомные параметры
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Selector */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Быстрый шаблон ТС:</label>
          <select
            value={selectedPresetIndex}
            onChange={(e) => handleSelectPreset(parseInt(e.target.value))}
            className="w-full bg-secondary text-foreground text-xs rounded-lg p-2.5 border border-border"
          >
            {VEHICLE_PRESETS.map((preset, idx) => (
              <option key={preset.name} value={idx}>
                {preset.name} ({preset.category} | ПСП {preset.vehicle.maxSdp} | {preset.vehicle.combatSpeed} СКО)
              </option>
            ))}
          </select>
        </div>

        {/* Vehicle Parameters */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="font-semibold block mb-1">Название ТС:</label>
            <Input value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} className="text-xs" />
          </div>

          <div>
            <label className="font-semibold block mb-1">Тип среды:</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as any)}
              className="w-full bg-secondary text-foreground text-xs rounded-lg p-2 border border-border"
            >
              <option value="ground">Наземный (Ground)</option>
              <option value="air">Воздушный (Air)</option>
              <option value="sea">Водный (Sea)</option>
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1">Боевая скорость (СКО):</label>
            <select
              value={combatSpeed}
              onChange={(e) => setCombatSpeed(parseInt(e.target.value))}
              className="w-full bg-secondary text-foreground text-xs rounded-lg p-2 border border-border"
            >
              {SPEED_TIERS.map(s => (
                <option key={s} value={s}>{s} СКО (СЛ {POSITIONING_DC_TABLE[s]})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1">Прочность (ПСП / SDP):</label>
            <Input type="number" value={maxSdp} onChange={(e) => setMaxSdp(parseInt(e.target.value) || 1)} className="text-xs font-mono" />
          </div>

          <div>
            <label className="font-semibold block mb-1">Броня (SP):</label>
            <Input type="number" value={armorSp} onChange={(e) => setArmorSp(parseInt(e.target.value) || 0)} className="text-xs font-mono" />
          </div>

          <div>
            <label className="font-semibold block mb-1">Клетка на сетке:</label>
            <Input type="number" value={gridPosition} onChange={(e) => setGridPosition(parseInt(e.target.value) || 0)} className="text-xs font-mono" />
          </div>
        </div>

        {/* Flags */}
        <div className="flex flex-wrap gap-4 text-xs pt-1 border-t border-border/40">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hasNos} onChange={(e) => setHasNos(e.target.checked)} className="accent-primary" />
            <span>Закись азота (NOS)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hasBulletproofGlass} onChange={(e) => setHasBulletproofGlass(e.target.checked)} className="accent-primary" />
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Пуленепробиваемые стёкла
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isLeadVehicle} onChange={(e) => setIsLeadVehicle(e.target.checked)} className="accent-primary" />
            <span className="font-bold text-amber-400">Ведущее ТС (Цель погони)</span>
          </label>
        </div>

        {/* Driver Section */}
        <div className="pt-2 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary">
              Водитель:
            </h4>
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  const preset = ACTOR_PRESETS.find(a => a.name === e.target.value);
                  if (preset) {
                    setDriverName(preset.actor.name);
                    setDriverRef(preset.actor.ref);
                    setDriverDriveSkill(preset.actor.driveSkill);
                    setDriverBonus(preset.actor.driveBonus);
                    setHasInterfacePlugs(preset.actor.hasInterfacePlugs);
                  }
                }}
                className="bg-secondary text-foreground text-xs rounded-lg px-2 py-1 border border-border"
              >
                <option value="">Шаблон водителя...</option>
                {ACTOR_PRESETS.map(ap => (
                  <option key={ap.name} value={ap.name}>{ap.name}</option>
                ))}
              </select>

              {encounterParticipants.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) handleImportEncounterCombatant(e.target.value);
                  }}
                  className="bg-secondary text-foreground text-xs rounded-lg px-2 py-1 border border-border"
                >
                  <option value="">Импорт из боя...</option>
                  {encounterParticipants.map(comb => (
                    <option key={comb.id} value={comb.id}>{comb.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="font-semibold block mb-1">Имя водителя:</label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} className="text-xs" />
            </div>
            <div>
              <label className="font-semibold block mb-1">РЕФ (REF):</label>
              <Input type="number" value={driverRef} onChange={(e) => setDriverRef(parseInt(e.target.value) || 1)} className="text-xs font-mono" />
            </div>
            <div>
              <label className="font-semibold block mb-1">Навык Вождения:</label>
              <Input type="number" value={driverDriveSkill} onChange={(e) => setDriverDriveSkill(parseInt(e.target.value) || 0)} className="text-xs font-mono" />
            </div>
            <div>
              <label className="font-semibold block mb-1">Бонусы/Кибер:</label>
              <Input type="number" value={driverBonus} onChange={(e) => setDriverBonus(parseInt(e.target.value) || 0)} className="text-xs font-mono" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={hasInterfacePlugs} onChange={(e) => setHasInterfacePlugs(e.target.checked)} className="accent-primary" />
            <span>Нейроинтерфейсный разъём (управление без рук)</span>
          </div>
        </div>

        {/* Passengers Section */}
        <div className="pt-2 border-t border-border space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
              Пассажиры ({passengers.length}):
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddPassengerFromPreset(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="bg-secondary text-foreground text-xs rounded-lg px-2 py-1 border border-border"
              >
                <option value="">+ Из шаблонов архетипов...</option>
                {ACTOR_PRESETS.map(ap => (
                  <option key={ap.name} value={ap.name}>{ap.name}</option>
                ))}
              </select>

              {encounterParticipants.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddPassengerFromEncounter(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="bg-secondary text-foreground text-xs rounded-lg px-2 py-1 border border-border"
                >
                  <option value="">+ Из текущего боя...</option>
                  {encounterParticipants.map(comb => (
                    <option key={comb.id} value={comb.id}>{comb.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Inline custom passenger add */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/20 border border-border/60">
            <Input
              placeholder="Имя нового пассажира..."
              value={customPassName}
              onChange={(e) => setCustomPassName(e.target.value)}
              className="text-xs h-7 flex-1"
            />
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground font-mono">РЕФ:</span>
              <Input
                type="number"
                value={customPassRef}
                onChange={(e) => setCustomPassRef(parseInt(e.target.value) || 1)}
                className="text-xs h-7 w-16 font-mono"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAddCustomPassenger}
              className="h-7 px-2.5 text-xs font-semibold gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить</span>
            </Button>
          </div>

          {passengers.length > 0 ? (
            <div className="space-y-1.5">
              {passengers.map((p, idx) => (
                <div key={p.id} className="p-2 rounded-lg bg-secondary/30 border border-border flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold">{p.name}</span>
                    <span className="text-muted-foreground ml-2">(РЕФ {p.ref}, Иниц: {p.initiative})</span>
                  </div>
                  <button
                    onClick={() => setPassengers(prev => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">
              Пассажиров нет. Можно добавить из шаблонов или создать вручную.
            </div>
          )}
        </div>

        {/* Dialog Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" onClick={handleCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
            Создать ТС
          </Button>
        </div>
      </div>
    </div>
  );
};
