import { Match, MatchEvent, Market } from '../types/betting';

// Sound effect generator using standard browser Web Audio API
export const playSoundEffect = (type: 'goal' | 'bet_placed' | 'cashout' | 'whistle' | 'click') => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'goal') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === 'bet_placed') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'cashout') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch {
    // AudioContext might be blocked before first interaction
  }
};

/**
 * Calculates dynamic odds adjustment for live match
 */
export const updateMatchOddsDynamically = (match: Match): Match => {
  if (match.status !== 'LIVE') return match;

  // Clone markets and apply subtle live market fluctuations
  const updatedMarkets: Market[] = match.markets.map((market) => {
    // If market is suspended, keep it
    if (market.choices.every(c => c.isSuspended)) {
      return market;
    }

    const updatedChoices = market.choices.map((choice) => {
      if (choice.isSuspended) return choice;

      // Random small jitter based on time and game dynamics (between -3% and +3%)
      const shouldFluctuate = Math.random() < 0.35;
      if (!shouldFluctuate) return { ...choice, trend: 'stable' as const };

      const deltaPercent = (Math.random() * 0.06 - 0.03); // -3% to +3%
      const newRaw = Math.max(1.02, Number((choice.value * (1 + deltaPercent)).toFixed(2)));
      const trend: 'up' | 'down' | 'stable' = newRaw > choice.value ? 'up' : newRaw < choice.value ? 'down' : 'stable';

      return {
        ...choice,
        previousValue: choice.value,
        value: newRaw,
        trend,
      };
    });

    return {
      ...market,
      choices: updatedChoices,
    };
  });

  return {
    ...match,
    markets: updatedMarkets,
  };
};

/**
 * Trigger an instant event like a Goal, Penalty, or Red Card
 */
export const triggerEventOnMatch = (
  match: Match,
  type: 'goal' | 'corner' | 'card' | 'penalty' | 'dangerous_attack',
  team: 'home' | 'away',
  customText?: string
): Match => {
  const isHome = team === 'home';
  const scoringTeamName = isHome ? match.homeTeam : match.awayTeam;
  const newHomeScore = type === 'goal' && isHome ? match.homeScore + 1 : match.homeScore;
  const newAwayScore = type === 'goal' && !isHome ? match.awayScore + 1 : match.awayScore;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let description = customText || '';
  if (!description) {
    if (type === 'goal') {
      description = `GOL DO ${scoringTeamName.toUpperCase()}! Balançou as redes aos ${match.minute}'!`;
    } else if (type === 'corner') {
      description = `Escanteio favorável para o ${scoringTeamName}.`;
    } else if (type === 'penalty') {
      description = `PÊNALTI MARCADO para o ${scoringTeamName}! Pressão máxima!`;
    } else if (type === 'card') {
      description = `Cartão amarelo apresentado para jogador do ${scoringTeamName}.`;
    } else {
      description = `${scoringTeamName} em ataque promissor!`;
    }
  }

  const newEvent: MatchEvent = {
    id: `ev-${Date.now()}-${Math.random()}`,
    minute: match.minute,
    type: type === 'card' ? 'yellow_card' : type,
    team,
    description,
    timestamp: timeStr,
  };

  // Adjust statistics
  const updatedStats = { ...match.stats };
  if (type === 'corner') {
    if (isHome) updatedStats.cornersHome += 1;
    else updatedStats.cornersAway += 1;
  } else if (type === 'dangerous_attack') {
    if (isHome) updatedStats.dangerousAttacksHome += 1;
    else updatedStats.dangerousAttacksAway += 1;
  } else if (type === 'goal') {
    if (isHome) {
      updatedStats.shotsOnTargetHome += 1;
    } else {
      updatedStats.shotsOnTargetAway += 1;
    }
  }

  // If a goal occurs, dramatically reshape 1x2 odds
  let updatedMarkets = match.markets;
  if (type === 'goal') {
    playSoundEffect('goal');
    updatedMarkets = match.markets.map((m) => {
      if (m.id === 'm-1x2') {
        const homeChoice = m.choices.find(c => c.id === '1');
        const drawChoice = m.choices.find(c => c.id === 'X');
        const awayChoice = m.choices.find(c => c.id === '2');

        const scoreDiff = newHomeScore - newAwayScore;
        let newHomeVal = 2.20;
        let newDrawVal = 3.10;
        let newAwayVal = 3.30;

        if (scoreDiff > 0) {
          newHomeVal = Math.max(1.15, Number((1.50 / scoreDiff).toFixed(2)));
          newDrawVal = Number((3.60 + scoreDiff * 0.8).toFixed(2));
          newAwayVal = Number((5.50 + scoreDiff * 2.0).toFixed(2));
        } else if (scoreDiff < 0) {
          const absDiff = Math.abs(scoreDiff);
          newAwayVal = Math.max(1.15, Number((1.50 / absDiff).toFixed(2)));
          newDrawVal = Number((3.60 + absDiff * 0.8).toFixed(2));
          newHomeVal = Number((5.50 + absDiff * 2.0).toFixed(2));
        }

        return {
          ...m,
          choices: [
            { id: '1', label: homeChoice?.label || match.homeTeam, value: newHomeVal, trend: newHomeVal > (homeChoice?.value || 0) ? 'up' : 'down' },
            { id: 'X', label: 'Empate', value: newDrawVal, trend: newDrawVal > (drawChoice?.value || 0) ? 'up' : 'down' },
            { id: '2', label: awayChoice?.label || match.awayTeam, value: newAwayVal, trend: newAwayVal > (awayChoice?.value || 0) ? 'up' : 'down' },
          ],
        };
      }
      return m;
    });
  }

  return {
    ...match,
    homeScore: newHomeScore,
    awayScore: newAwayScore,
    activeAttackTeam: team,
    attackIntensity: type === 'penalty' ? 'penalty' : type === 'dangerous_attack' ? 'dangerous' : 'normal',
    stats: updatedStats,
    events: [newEvent, ...match.events],
    markets: updatedMarkets,
  };
};

/**
 * Toggles market suspension (e.g. during VAR or penalty)
 */
export const toggleMarketSuspension = (match: Match, suspend: boolean): Match => {
  return {
    ...match,
    markets: match.markets.map(m => ({
      ...m,
      choices: m.choices.map(c => ({
        ...c,
        isSuspended: suspend,
      })),
    })),
  };
};
