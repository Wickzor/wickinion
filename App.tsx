import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CardDef, CardType, GameState, BoardSetup, Player, GameMode, NetworkMessage, GameActionPayload } from './types';
import { CARDS, BOARD_SETUPS, STARTING_DECK } from './constants';
import { CardDisplay } from './components/CardDisplay';
import { RotateCcw, Sparkles, Play, Coins, Crown, Map as MapIcon, Sword, Layers, X, Trophy, Volume2, VolumeX, Eye, ArrowRight, Zap, Skull, Users, User, Wifi, Copy, CheckCircle, Repeat, Check, Trash2, ArrowUpCircle, ShieldAlert, ChevronRight, Hourglass, Menu, Scroll, ShoppingBag, Lock, Maximize, Minimize, Flame, Swords, Loader, BookOpen } from 'lucide-react';
import { Peer, DataConnection } from 'peerjs';

// --- Types for Interactions ---
interface Interaction {
  id: string;
  type: 'HAND_SELECTION' | 'SUPPLY_SELECTION' | 'CUSTOM_SELECTION' | 'CONFIRMATION';
  source: string; // Card Name
  min: number;
  max: number; // -1 for unlimited
  targetPlayerIndex?: number;
  
  // For CUSTOM_SELECTION (e.g., Sentry looking at top cards)
  customCards?: CardDef[]; 
  
  filter?: (c: CardDef) => boolean;
  filterMessage?: string;
  onResolve: (selectedCards: CardDef[], selectedIndices: number[]) => void;
  confirmLabel?: string;
}

// Fisher-Yates shuffle
const shuffle = (array: CardDef[]): CardDef[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// --- Audio Configuration ---
const SOUNDS = {
  music: "https://upload.wikimedia.org/wikipedia/commons/transcoded/9/99/Greensleeves_-_traditional.ogg/Greensleeves_-_traditional.ogg.mp3", 
  fireplace: "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d4/Enclosed_fireplace_sounds.ogg/Enclosed_fireplace_sounds.ogg.mp3", 
  flip: "https://upload.wikimedia.org/wikipedia/commons/transcoded/9/9b/Card_flip.ogg/Card_flip.ogg.mp3", 
  shuffle: "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/22/Card_shuffle.ogg/Card_shuffle.ogg.mp3",
  buy: "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/52/Coin_drop_on_concrete.ogg/Coin_drop_on_concrete.ogg.mp3" 
};

// Animated Resource Component with Physical Presence
const ResourceCounter = ({ value, label, icon }: { value: number, label: string, icon?: React.ReactNode }) => {
  const [animate, setAnimate] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 200);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-0.5 md:gap-1 lg:gap-1 group relative">
       {/* Backlight Glow */}
       <div className={`absolute inset-0 bg-gold rounded-full blur-xl opacity-0 transition-opacity duration-300 ${animate ? 'opacity-40' : 'group-hover:opacity-10'}`}></div>
       
       <div className={`relative w-10 h-10 md:w-12 md:h-12 lg:w-10 lg:h-10 xl:w-12 xl:h-12 2xl:w-28 2xl:h-28 rounded-full flex items-center justify-center bg-gradient-to-br from-[#2c1e16] to-black shadow-token border border-[#8a6e38] transition-transform duration-200 ${animate ? 'scale-110 brightness-110' : 'group-hover:scale-105'}`}>
          <div className="absolute inset-0 rounded-full border border-[#ffffff]/10"></div>
          <span className={`text-lg md:text-xl lg:text-lg xl:text-xl 2xl:text-5xl font-sans font-black text-gold-light text-emboss z-10`}>{value}</span>
       </div>
       <div className="flex items-center gap-1 text-[#8a6e38] text-[6px] md:text-[8px] lg:text-[8px] xl:text-[10px] 2xl:text-base font-serif tracking-[0.2em] uppercase font-bold drop-shadow-sm">{icon} {label}</div>
    </div>
  );
};

// Ember Particle Component
const EmberParticles = () => {
    const particles = Array.from({ length: 15 });
    return (
        <div className="fixed inset-0 pointer-events-none z-[2]">
            {particles.map((_, i) => (
                <div 
                    key={i} 
                    className="ember"
                    style={{
                        left: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 10}s`,
                        opacity: Math.random() * 0.7
                    }}
                />
            ))}
        </div>
    );
}

interface FloatingText { id: number; text: string; color: string; }

export default function App() {
  // --- Loading State ---
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("Initializing Realm...");

  // --- Game State ---
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [supply, setSupply] = useState<Record<string, number>>({});
  const [trash, setTrash] = useState<CardDef[]>([]); // New Trash Pile
  const [turnCount, setTurnCount] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [log, setLog] = useState<string[]>(["Welcome to Wickinion!"]);
  
  // --- Interaction State ---
  const [interactionQueue, setInteractionQueue] = useState<Interaction[]>([]);
  const [selectedHandIndices, setSelectedHandIndices] = useState<number[]>([]);
  const [viewingSupplyCard, setViewingSupplyCard] = useState<CardDef | null>(null);
  
  // --- Online Multiplayer State ---
  const [gameMode, setGameMode] = useState<GameMode>('LOCAL');
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null); 
  const [peerId, setPeerId] = useState<string>('');
  const [hostIdInput, setHostIdInput] = useState('');
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [lobbyStatus, setLobbyStatus] = useState<string>('');
  
  // Refs
  const peerRef = useRef<Peer | null>(null);
  const hostConnectionsRef = useRef<DataConnection[]>([]); 
  const clientConnectionRef = useRef<DataConnection | null>(null);
  const processingRef = useRef<boolean>(false); 

  // UI State
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false); // New Log Modal
  const [gameMenuOpen, setGameMenuOpen] = useState(false); // Replaces mobileMenuOpen
  const [hasStarted, setHasStarted] = useState(false); 
  const [showGameSetup, setShowGameSetup] = useState(false); 
  const [showOnlineMenu, setShowOnlineMenu] = useState(false); 
  const [showGuide, setShowGuide] = useState(false); // New Guide Modal State
  const [selectedBoardId, setSelectedBoardId] = useState<string>('first_game');
  const [playerCountMode, setPlayerCountMode] = useState<number>(2); 
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [hoveredCard, setHoveredCard] = useState<CardDef | null>(null);
  const [shakingCardId, setShakingCardId] = useState<string | null>(null); 
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Logic State
  const [actionMultiplier, setActionMultiplier] = useState<number>(1); 
  
  // Audio
  const [isMuted, setIsMuted] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  // Computed
  const currentPlayer = players[currentPlayerIndex];
  const currentInteraction = interactionQueue.length > 0 ? interactionQueue[0] : null;
  const isInteracting = !!currentInteraction;
  const activePlayerIndex = currentInteraction?.targetPlayerIndex ?? currentPlayerIndex;
  const activePlayer = players[activePlayerIndex];
  const isMyTurn = gameMode === 'LOCAL' || (myPlayerId === activePlayerIndex);
  const hasActionsInHand = activePlayer?.hand.some(c => c.type === CardType.ACTION || c.type === CardType.REACTION);
  const currentPhase = (currentPlayer?.actions > 0 && hasActionsInHand) ? 'ACTION PHASE' : 'BUY PHASE';

  // --- Boot Sequence & Audio Engine ---
  useEffect(() => {
    // 1. Initialize Audio Objects
    audioRefs.current = {
      music: new Audio(SOUNDS.music),
      fireplace: new Audio(SOUNDS.fireplace),
      flip: new Audio(SOUNDS.flip),
      shuffle: new Audio(SOUNDS.shuffle),
      buy: new Audio(SOUNDS.buy),
    };
    audioRefs.current.music.loop = true;
    audioRefs.current.music.volume = 0.2; 
    audioRefs.current.fireplace.loop = true;
    audioRefs.current.fireplace.volume = 0.4;
    
    // Preload FX
    audioRefs.current.flip.load();
    audioRefs.current.buy.load();
    audioRefs.current.shuffle.load();

    const preloadImages = async (srcs: string[], onProgress: (progress: number) => void) => {
        let loaded = 0;
        const total = srcs.length;
        
        const promises = srcs.map((src) => {
            return new Promise<void>((resolve) => {
                const img = new Image();
                img.src = src;
                img.onload = () => {
                    loaded++;
                    onProgress((loaded / total) * 100);
                    resolve();
                };
                img.onerror = () => {
                    loaded++;
                    onProgress((loaded / total) * 100); // Proceed even on error
                    resolve();
                };
            });
        });
        await Promise.all(promises);
    };

    // 2. Preload Assets & Run Loading Bar
    const bootGame = async () => {
        const loadingTips = [
            "Shuffling the King's deck...",
            "Polishing gold coins...",
            "Scouting the provinces...",
            "Sharpening swords...",
            "Consulting the archives...",
            "Preparing the throne room...",
        ];
        
        // Cycle tips
        const textInterval = setInterval(() => {
            setLoadingText(loadingTips[Math.floor(Math.random() * loadingTips.length)]);
        }, 1500);

        // --- REAL ASSET LOADING ---
        // Collect all card images + some UI assets
        const cardImages = Object.values(CARDS).map(c => c.image);
        // Preload the specific background assets
        const uiAssets = ['./booting.png', './startmenu.png'];
        const allAssets = [...cardImages, ...uiAssets];

        // We want the loading screen to be visible for at least 4 seconds for "premium feel"
        const minTimePromise = new Promise(resolve => setTimeout(resolve, 4000));
        
        // Track real loading progress
        const assetPromise = preloadImages(allAssets, (pct) => {
            // We scale the asset loading to 0-90%, keeping 10% for the final "Ready" state
            setLoadingProgress(Math.min(90, pct));
        });

        // Wait for both
        await Promise.all([minTimePromise, assetPromise]);

        clearInterval(textInterval);
        setLoadingProgress(100);
        setLoadingText("Enter the Realm");
        
        // Small delay at 100%
        setTimeout(() => {
            setIsLoading(false);
        }, 800);
    };

    bootGame();

    return () => {
      Object.values(audioRefs.current).forEach((audio: any) => { 
        if (audio && typeof audio.pause === 'function') {
          audio.pause(); 
          audio.src = "";
        }
      });
      peerRef.current?.destroy();
    };
  }, []);

  // Full Screen Logic
  useEffect(() => {
      const handleFullScreenChange = () => {
          setIsFullScreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullScreenChange);
      return () => {
          document.removeEventListener('fullscreenchange', handleFullScreenChange);
      };
  }, []);

  const toggleFullScreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
              console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
          });
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen();
          }
      }
  };

  // Audio Playback with Physics (Pitch/Volume Variance)
  const playSfx = (name: 'flip' | 'shuffle' | 'buy') => {
    if (isMuted || !audioRefs.current[name]) return;
    const original = audioRefs.current[name];
    
    // AAA Logic: Clone node for polyphony (so rapid sounds don't cut each other off)
    const clone = original.cloneNode() as HTMLAudioElement;
    
    // Physics: Randomize pitch (playbackRate) and volume slightly to simulate organic variance
    // 0.95 - 1.05 pitch range
    clone.playbackRate = 0.95 + Math.random() * 0.1;
    // 0.8 - 1.0 volume range relative to base
    clone.volume = Math.min(1, (original.volume * 0.8) + (Math.random() * 0.2));
    
    clone.play().catch(() => {});
  };

  useEffect(() => {
    const { music, fireplace } = audioRefs.current;
    if (!music || !fireplace || !hasStarted) return;
    if (isMuted) { music.pause(); fireplace.pause(); } 
    else { 
        music.play().catch(() => {}); 
        fireplace.play().catch(() => {}); 
    }
  }, [isMuted, hasStarted, showGameSetup]);

  const addLog = (message: string) => setLog(prev => [...prev, message]);
  const addFloatingText = (text: string, color: string = "text-white") => {
    const id = Date.now() + Math.random();
    setFloatingTexts(prev => [...prev, { id, text, color }]);
    setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1500);
  };
  
  const triggerShake = (id: string) => {
    setShakingCardId(id);
    setTimeout(() => setShakingCardId(null), 500);
  };

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log, isLogOpen]);

  // --- Helpers ---
  const calculateScore = (player: Player) => {
    const allCards = [...player.deck, ...player.hand, ...player.discard, ...player.playArea];
    return allCards.reduce((acc, c) => {
        if (c.id === 'gardens') {
            return acc + Math.floor(allCards.length / 10);
        }
        return acc + (c.points || 0);
    }, 0);
  };

  // --- Networking Logic ---

  const initHost = () => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id) => { setPeerId(id); setLobbyStatus('Waiting for challengers...'); setMyPlayerId(0); });
    peer.on('connection', (conn) => {
        hostConnectionsRef.current.push(conn);
        setConnectedPeers(prev => [...prev, conn.peer]);
        conn.on('data', (data: any) => handleNetworkMessage(data as NetworkMessage));
        conn.on('close', () => setConnectedPeers(prev => prev.filter(p => p !== conn.peer)));
    });
  };

  const joinGame = () => {
      if (!hostIdInput) return;
      const peer = new Peer();
      peerRef.current = peer;
      peer.on('open', () => {
          const conn = peer.connect(hostIdInput);
          clientConnectionRef.current = conn;
          setLobbyStatus('Connecting to realm...');
          conn.on('open', () => { setLobbyStatus('Connected! Awaiting host...'); setGameMode('ONLINE_CLIENT'); });
          conn.on('data', (data: any) => handleNetworkMessage(data as NetworkMessage));
      });
  };

  // Dedicated sender for Host to push latest state
  const sendFullStateUpdate = (p: Player[] = players, s: Record<string, number> = supply, t: number = turnCount, cIdx: number = currentPlayerIndex, l: string[] = log) => {
      if (gameMode !== 'ONLINE_HOST') return;
      const payload = { players: p, supply: s, turnCount: t, currentPlayerIndex: cIdx, log: l };
      hostConnectionsRef.current.forEach(conn => conn.send({ type: 'STATE_UPDATE', payload }));
  };

  const sendActionToHost = (payload: GameActionPayload) => {
      if (gameMode !== 'ONLINE_CLIENT' || !clientConnectionRef.current) return;
      clientConnectionRef.current.send({ type: 'ACTION', payload: { ...payload, playerIndex: myPlayerId } });
  };

  const handleNetworkMessage = (msg: NetworkMessage) => {
      if (msg.type === 'STATE_UPDATE') {
          const { players: p, supply: s, turnCount: t, currentPlayerIndex: c, log: l } = msg.payload;
          setPlayers(p); setSupply(s); setTurnCount(t); setCurrentPlayerIndex(c); setLog(l);
          if (!hasStarted) { setHasStarted(true); setShowGameSetup(false); setShowOnlineMenu(false); }
      } 
      else if (msg.type === 'START_GAME') {
          setMyPlayerId(msg.payload.yourPlayerId);
          setHasStarted(true); setShowGameSetup(false); setShowOnlineMenu(false);
          setGameMode('ONLINE_CLIENT');
          addLog("Connected to Online Game.");
      }
      else if (msg.type === 'ACTION') {
          if (gameMode !== 'ONLINE_HOST') return;
          const { actionType, playerIndex, cardIndex, cardId } = msg.payload;
          if (playerIndex !== currentPlayerIndex) return; // Basic turn validation on host

          if (actionType === 'PLAY_CARD' && typeof cardIndex === 'number') executePlayCard(playerIndex, cardIndex);
          else if (actionType === 'BUY_CARD' && cardId) executeBuyCard(playerIndex, cardId);
          else if (actionType === 'PLAY_ALL_TREASURES') executePlayAllTreasures(playerIndex);
          else if (actionType === 'END_TURN') executeEndTurn(playerIndex);
      }
  };


  // --- Game Mechanics ---

  const checkGameOver = (currentSupply: Record<string, number>) => {
    // Original condition: Province empty OR 3 piles empty
    // New condition: ANY Lands & Titles (Province, Duchy, Estate) empty OR 3 piles empty
    
    if ((currentSupply['province'] ?? 0) <= 0) return true;
    if ((currentSupply['duchy'] ?? 0) <= 0) return true;
    if ((currentSupply['estate'] ?? 0) <= 0) return true;
    
    const emptyPiles = Object.values(currentSupply).filter(count => count <= 0).length;
    return emptyPiles >= 3;
  };

  const drawCards = useCallback((count: number, currentDeck: CardDef[], currentDiscard: CardDef[], currentHand: CardDef[]) => {
    let newDeck = [...currentDeck];
    let newDiscard = [...currentDiscard];
    let newHand = [...currentHand];
    let didShuffle = false;

    for (let i = 0; i < count; i++) {
      if (newDeck.length === 0) {
        if (newDiscard.length === 0) break;
        newDeck = shuffle(newDiscard);
        newDiscard = [];
        didShuffle = true;
      }
      const card = newDeck.pop();
      if (card) newHand.push(card);
    }
    return { newDeck, newDiscard, newHand, didShuffle };
  }, []);

  const initGame = (boardId: string, playerCount: number) => {
      const newPlayers: Player[] = [];
      for (let i = 0; i < playerCount; i++) {
          const shuffledStart = shuffle([...STARTING_DECK]);
          const { newDeck, newHand } = drawCards(5, shuffledStart, [], []);
          newPlayers.push({
              id: i, name: `Player ${i + 1}`, deck: newDeck, hand: newHand, discard: [], playArea: [], actions: 1, buys: 1, gold: 0
          });
      }
      
      const selectedBoard = BOARD_SETUPS.find(b => b.id === boardId) || BOARD_SETUPS[0];
      const newSupply: Record<string, number> = {
          copper: 60 - (playerCount * 7), silver: 40, gold: 30, estate: playerCount > 2 ? 12 : 8, duchy: playerCount > 2 ? 12 : 8, province: playerCount > 2 ? 12 : 8, curse: (playerCount - 1) * 10, 
      };
      selectedBoard.cards.forEach(cardId => newSupply[cardId] = 10);

      setPlayers(newPlayers);
      setCurrentPlayerIndex(0);
      setSupply(newSupply);
      setTrash([]);
      setTurnCount(1);
      setGameOver(false);
      const newLog = [`Reign Started: ${selectedBoard.name}`, `${playerCount} Lords have entered the fray.`];
      setLog(newLog);
      setIsDiscardOpen(false);
      setIsTransitioning(false);
      setActionMultiplier(1);
      setInteractionQueue([]);
      setSelectedHandIndices([]);
      setViewingSupplyCard(null);

      if (!isMuted) { playSfx('shuffle'); audioRefs.current.music?.play().catch(()=>{}); }

      if (gameMode === 'ONLINE_HOST') {
          hostConnectionsRef.current.forEach((conn, idx) => conn.send({ type: 'START_GAME', payload: { yourPlayerId: idx + 1 } }));
          setTimeout(() => sendFullStateUpdate(newPlayers, newSupply, 1, 0, newLog), 100);
      }
      setShowGameSetup(false);
  };

  // --- Handlers (UI triggers) ---

  const handleHandCardClick = (index: number) => {
      // 1. Interaction Mode: Toggle Selection
      if (currentInteraction) {
          if (currentInteraction.type === 'HAND_SELECTION' || currentInteraction.type === 'CUSTOM_SELECTION') {
               // Check if index matches target player (Sanity check)
                if (activePlayerIndex !== (gameMode === 'LOCAL' ? activePlayerIndex : myPlayerId)) return;

                const isSelected = selectedHandIndices.includes(index);
                if (isSelected) {
                    setSelectedHandIndices(prev => prev.filter(i => i !== index));
                } else {
                    const card = currentInteraction.type === 'CUSTOM_SELECTION' && currentInteraction.customCards 
                        ? currentInteraction.customCards[index]
                        : activePlayer.hand[index];
                        
                    // Check filters
                    if (currentInteraction.filter && !currentInteraction.filter(card)) {
                        triggerShake(`${index}-${card.id}`);
                        return;
                    }
                    // Check Max limit
                    if (currentInteraction.max !== -1 && selectedHandIndices.length >= currentInteraction.max) {
                        // If single select, swap selection
                        if (currentInteraction.max === 1) {
                            setSelectedHandIndices([index]);
                        } else {
                            triggerShake(`${index}-${card.id}`);
                        }
                        return;
                    }
                    setSelectedHandIndices(prev => [...prev, index]);
                }
          }
          return;
      }

      // 2. Play Mode
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 300);

      // Check for 0 actions
      const card = currentPlayer.hand[index];
      const isAction = card.type === CardType.ACTION || card.type === CardType.REACTION;
      
      if (isAction && currentPlayer.actions <= 0 && actionMultiplier === 1) {
          addLog("❌ You have no Actions remaining.");
          triggerShake(`${index}-${card.id}`);
          return;
      }

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'PLAY_CARD', cardIndex: index });
      } else {
          executePlayCard(currentPlayerIndex, index);
      }
  };

  const handleSupplyCardClick = (cardId: string) => {
      // 1. Interaction Mode: Gain from Supply
      if (currentInteraction && currentInteraction.type === 'SUPPLY_SELECTION') {
          const card = CARDS[cardId];
          if (currentInteraction.filter && !currentInteraction.filter(card)) {
              addFloatingText("Invalid Selection", "text-red-500");
              return;
          }
           if (supply[cardId] < 1) {
               addFloatingText("Empty Pile", "text-red-500");
               return;
           }
          
          // Execute Resolution
          currentInteraction.onResolve([card], []);
          // Remove current interaction
          setInteractionQueue(prev => prev.slice(1));
          return;
      }

      // 2. Buy Phase - OPEN MODAL instead of buying immediately
      const card = CARDS[cardId];
      if (card) {
          setViewingSupplyCard(card);
      }
  };

  const confirmBuyCard = () => {
      if (!viewingSupplyCard) return;
      
      // Basic Local Checks logic moved here for immediate feedback, actual execution does real check
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 300);

      const cardId = viewingSupplyCard.id;

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'BUY_CARD', cardId });
      } else {
          executeBuyCard(currentPlayerIndex, cardId);
      }
      setViewingSupplyCard(null); // Close modal
  };

  const handleConfirmInteraction = () => {
      if (!currentInteraction) return;

      if (currentInteraction.min !== -1 && selectedHandIndices.length < currentInteraction.min) {
          addFloatingText(`Select at least ${currentInteraction.min}`, "text-red-500");
          return;
      }

      // Resolve
      // For CUSTOM_SELECTION, map indices to the customCards array
      let selectedCards: CardDef[] = [];
      if (currentInteraction.type === 'CUSTOM_SELECTION' && currentInteraction.customCards) {
          selectedCards = selectedHandIndices.map(i => currentInteraction.customCards![i]);
      } else {
          selectedCards = selectedHandIndices.map(i => activePlayer.hand[i]);
      }
      
      currentInteraction.onResolve(selectedCards, selectedHandIndices);
      
      // Clear selection and pop queue
      setSelectedHandIndices([]);
      setInteractionQueue(prev => prev.slice(1));
  };

  const handlePlayAllTreasures = () => {
      if (isInteracting) return; 
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 300);

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'PLAY_ALL_TREASURES' });
      } else {
          executePlayAllTreasures(currentPlayerIndex);
      }
  };

  const handleEndTurn = () => {
      if (isInteracting) return;
      if (processingRef.current) return;
      processingRef.current = true;
      setTimeout(() => { processingRef.current = false }, 500);

      if (gameMode === 'ONLINE_CLIENT') {
          sendActionToHost({ actionType: 'END_TURN' });
      } else {
          executeEndTurn(currentPlayerIndex);
      }
  };

  // --- Execution Logic ---

  function executePlayCard(playerIdx: number, cardIdx: number) {
      const player = players[playerIdx];
      const card = player.hand[cardIdx];
      if (!card) return;

      const isAction = card.type === CardType.ACTION || card.type === CardType.REACTION;
      if (isAction && player.actions <= 0 && actionMultiplier === 1) return;

      if (gameMode === 'LOCAL' || gameMode === 'ONLINE_HOST') playSfx('flip');

      // Move card from hand to play area
      const newHand = [...player.hand];
      newHand.splice(cardIdx, 1);
      const newPlayArea = [...player.playArea, card];
      
      let newActions = player.actions;
      if (isAction && actionMultiplier === 1) newActions -= 1;

      // Base Stats Update
      let newBuys = player.buys;
      let newGold = player.gold;
      let newDeck = player.deck;
      let newDiscard = player.discard;
      let drawnHand = newHand; 
      const newLog = [...log];

      // --- Helper to queue interaction for current player ---
      const queueInteraction = (interaction: Interaction) => {
          setInteractionQueue(prev => [...prev, interaction]);
      };

      // Execute Immediate Stats
      const timesToPlay = (isAction) ? actionMultiplier : 1;
      
      for(let i=0; i<timesToPlay; i++) {
          newLog.push(`${player.name} plays ${card.name} ${i > 0 ? '(Second Cast)' : ''}`);

          if (isAction) {
              newActions += (card.actions || 0);
              newBuys += (card.buys || 0);
              newGold += (card.gold || 0);
              
              if (card.cards && card.cards > 0) {
                 const res = drawCards(card.cards, newDeck, newDiscard, drawnHand);
                 newDeck = res.newDeck;
                 newDiscard = res.newDiscard;
                 drawnHand = res.newHand;
                 if (res.didShuffle && (gameMode === 'LOCAL' || gameMode === 'ONLINE_HOST')) playSfx('shuffle');
              }
          } else if (card.type === CardType.TREASURE) {
              newGold += (card.value || 0);
          }

          // --- Complex Card Logic (Queue Interactions) ---
          
          if (card.id === 'cellar') {
              queueInteraction({
                  id: `cellar-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Cellar',
                  min: 0, max: -1,
                  targetPlayerIndex: playerIdx,
                  confirmLabel: 'Discard & Draw',
                  onResolve: (selected, indices) => {
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const cardsToDiscard = indices.map(idx => p.hand[idx]);
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          const updatedDiscard = [...p.discard, ...cardsToDiscard];
                          const { newDeck: d, newDiscard: disc, newHand: h } = drawCards(indices.length, p.deck, updatedDiscard, remainingHand);
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, deck: d, discard: disc, hand: h } : pl);
                      });
                      addLog(`${player.name} discarded ${selected.length} cards and drew ${selected.length}.`);
                  }
              });
          }
          
          if (card.id === 'chapel') {
              queueInteraction({
                  id: `chapel-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Chapel',
                  min: 0, max: 4,
                  targetPlayerIndex: playerIdx,
                  confirmLabel: 'Trash Cards',
                  onResolve: (selected, indices) => {
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand } : pl);
                      });
                      setTrash(prev => [...prev, ...selected]);
                      addLog(`${player.name} trashed ${selected.length} cards.`);
                  }
              });
          }

          if (card.id === 'sentry') {
              // 1. Draw 2 cards (virtually) to see them
              // Note: We use drawCards logic but keep them in a separate buffer first
              const { newDeck: tempDeck, newDiscard: tempDiscard, newHand: drawn } = drawCards(2, newDeck, newDiscard, []);
              newDeck = tempDeck; 
              newDiscard = tempDiscard;
              
              // Only proceed if we actually drew something
              if (drawn.length > 0) {
                  // Phase 1: Trash
                  queueInteraction({
                      id: `sentry-trash-${Date.now()}-${i}`,
                      type: 'CUSTOM_SELECTION',
                      customCards: drawn,
                      source: 'Sentry (Trash)',
                      min: 0, max: 2,
                      targetPlayerIndex: playerIdx,
                      confirmLabel: 'Trash Selected',
                      onResolve: (trashed, trashedIndices) => {
                          setTrash(prev => [...prev, ...trashed]);
                          const keptAfterTrash = drawn.filter((_, idx) => !trashedIndices.includes(idx));
                          if (trashed.length > 0) addLog(`${player.name} trashed ${trashed.length} cards with Sentry.`);
                          
                          if (keptAfterTrash.length > 0) {
                              // Phase 2: Discard
                              queueInteraction({
                                  id: `sentry-discard-${Date.now()}-${i}`,
                                  type: 'CUSTOM_SELECTION',
                                  customCards: keptAfterTrash,
                                  source: 'Sentry (Discard)',
                                  min: 0, max: keptAfterTrash.length,
                                  targetPlayerIndex: playerIdx,
                                  confirmLabel: 'Discard Selected',
                                  onResolve: (discarded, discardedIndices) => {
                                      const keptFinal = keptAfterTrash.filter((_, idx) => !discardedIndices.includes(idx));
                                      
                                      setPlayers(prevPlayers => {
                                          const p = prevPlayers[playerIdx];
                                          // Update deck with kept cards (put back on top)
                                          // In a real game you order them. Here we just push them back.
                                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { 
                                              ...pl, 
                                              discard: [...pl.discard, ...discarded],
                                              deck: [...pl.deck, ...keptFinal] 
                                          } : pl);
                                      });
                                      if (discarded.length > 0) addLog(`${player.name} discarded ${discarded.length} cards.`);
                                      if (keptFinal.length > 0) addLog(`${player.name} put ${keptFinal.length} cards back on deck.`);
                                  }
                              });
                          }
                      }
                  });
              }
          }

          if (card.id === 'library') {
               // Simplification: Draw until 7 cards. If Action is drawn, set aside.
               // Since interactive "Set Aside" loop is complex in this architecture,
               // we will implement: Draw until 7.
               const currentHandSize = drawnHand.length;
               const needed = 7 - currentHandSize;
               if (needed > 0) {
                   // We actually just run the draw. 
                   // Advanced logic: To strictly follow rules, we'd need a recursive interaction queue.
                   // For this version: Auto-draw to 7.
                   const res = drawCards(needed, newDeck, newDiscard, drawnHand);
                   newDeck = res.newDeck;
                   newDiscard = res.newDiscard;
                   drawnHand = res.newHand;
                   newLog.push(`${player.name} drew up to 7 cards.`);
               }
          }

          if (card.id === 'harbinger') {
              if (newDiscard.length > 0) {
                  queueInteraction({
                      id: `harbinger-${Date.now()}-${i}`,
                      type: 'CUSTOM_SELECTION',
                      source: 'Harbinger',
                      customCards: newDiscard, // Select from discard
                      min: 1, max: 1,
                      targetPlayerIndex: playerIdx,
                      confirmLabel: 'Topdeck',
                      onResolve: (selected, indices) => {
                          const selectedCard = selected[0];
                          // Remove from discard, add to deck
                          setPlayers(prevPlayers => {
                              const p = prevPlayers[playerIdx];
                              // Find index in actual discard to remove (first match)
                              const realDiscard = [...p.discard];
                              const removeIdx = realDiscard.findIndex(c => c.id === selectedCard.id);
                              if (removeIdx > -1) realDiscard.splice(removeIdx, 1);
                              
                              return prevPlayers.map((pl, idx) => idx === playerIdx ? { 
                                  ...pl, 
                                  discard: realDiscard,
                                  deck: [...pl.deck, selectedCard] 
                              } : pl);
                          });
                          addLog(`${player.name} put ${selectedCard.name} from discard onto deck.`);
                      }
                  });
              }
          }

          if (card.id === 'vassal') {
             // 1. Discard top card
             const res = drawCards(1, newDeck, newDiscard, []);
             if (res.newHand.length > 0) {
                 const revealed = res.newHand[0];
                 newDeck = res.newDeck;
                 newDiscard = res.newDiscard; // Deck shuffled if needed
                 
                 // Add to discard immediately? Or wait? 
                 // Rules: Discard it. If action, you may play it.
                 // We put it in discard for state consistency, but track it.
                 newDiscard = [...newDiscard, revealed];
                 newLog.push(`${player.name} Vassal reveals: ${revealed.name}`);

                 if (revealed.type === CardType.ACTION || revealed.type === CardType.REACTION) {
                     queueInteraction({
                         id: `vassal-play-${Date.now()}-${i}`,
                         type: 'CONFIRMATION',
                         source: `Vassal (${revealed.name})`,
                         min: 0, max: 0,
                         targetPlayerIndex: playerIdx,
                         confirmLabel: 'Play It',
                         filterMessage: `Play ${revealed.name} from discard?`,
                         onResolve: () => {
                             // User chose to play it.
                             // Remove from discard, put in play area, execute it.
                             // We need to trigger executePlayCard recursively *but* carefully.
                             // Since executePlayCard expects card in HAND, we cheat:
                             // Add to hand, then auto-play? Or make executePlayCard handle generic source?
                             // Simplest: Add to hand, call executePlayCard immediately.
                             setPlayers(prevPlayers => {
                                 const p = prevPlayers[playerIdx];
                                 const disc = [...p.discard];
                                 disc.pop(); // Remove the vassal'd card
                                 return prevPlayers.map((pl, idx) => idx === playerIdx ? { 
                                     ...pl, 
                                     discard: disc,
                                     hand: [...pl.hand, revealed] 
                                 } : pl);
                             });
                             // Use timeout to let state settle then trigger play
                             setTimeout(() => {
                                 // Finding the index of the card we just added (last one)
                                 setPlayers(current => {
                                     const p = current[playerIdx];
                                     executePlayCard(playerIdx, p.hand.length - 1);
                                     return current;
                                 });
                             }, 100);
                         }
                     });
                 }
             }
          }

          if (card.id === 'workshop') {
              queueInteraction({
                  id: `workshop-${Date.now()}-${i}`,
                  type: 'SUPPLY_SELECTION',
                  source: 'Workshop',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.cost <= 4,
                  filterMessage: 'Cost up to 4',
                  onResolve: (selected) => {
                      const c = selected[0];
                      setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                      setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, discard: [...pl.discard, c] } : pl));
                      addLog(`${player.name} gained ${c.name} via Workshop.`);
                  }
              });
          }

          if (card.id === 'artisan') {
             queueInteraction({
                  id: `artisan-gain-${Date.now()}-${i}`,
                  type: 'SUPPLY_SELECTION',
                  source: 'Artisan',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.cost <= 5,
                  filterMessage: 'Cost up to 5',
                  onResolve: (selected) => {
                      const c = selected[0];
                      setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                      setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: [...pl.hand, c] } : pl));
                      addLog(`${player.name} gained ${c.name} to hand.`);
                      
                      queueInteraction({
                          id: `artisan-put-${Date.now()}-${i}`,
                          type: 'HAND_SELECTION',
                          source: 'Artisan (Put back)',
                          min: 1, max: 1,
                          targetPlayerIndex: playerIdx,
                          confirmLabel: 'Put on Deck',
                          onResolve: (sel, ind) => {
                              setPlayers(prevPlayers => {
                                  const p = prevPlayers[playerIdx];
                                  const cardToTop = p.hand[ind[0]];
                                  const remainingHand = p.hand.filter((_, ix) => ix !== ind[0]);
                                  return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand, deck: [...pl.deck, cardToTop] } : pl);
                              });
                              addLog(`${player.name} put a card onto their deck.`);
                          }
                      });
                  }
              });
          }

          if (card.id === 'mine') {
               queueInteraction({
                  id: `mine-trash-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Mine',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.type === CardType.TREASURE,
                  filterMessage: 'Select a Treasure',
                  confirmLabel: 'Trash & Upgrade',
                  onResolve: (selected, indices) => {
                      const trashedCard = selected[0];
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand } : pl);
                      });
                      setTrash(prev => [...prev, trashedCard]);
                      addLog(`${player.name} trashed ${trashedCard.name}.`);
                      
                      queueInteraction({
                          id: `mine-gain-${Date.now()}-${i}`,
                          type: 'SUPPLY_SELECTION',
                          source: 'Mine',
                          min: 1, max: 1,
                          targetPlayerIndex: playerIdx,
                          filter: (c) => c.type === CardType.TREASURE && c.cost <= trashedCard.cost + 3,
                          filterMessage: `Treasure cost max ${trashedCard.cost + 3}`,
                          onResolve: (gained) => {
                              const c = gained[0];
                              setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                              setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: [...pl.hand, c] } : pl));
                              addLog(`${player.name} mined ${c.name} into hand.`);
                          }
                      });
                  }
              });
          }

          if (card.id === 'remodel') {
              queueInteraction({
                  id: `remodel-trash-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Remodel',
                  min: 1, max: 1,
                  targetPlayerIndex: playerIdx,
                  confirmLabel: 'Trash & Remodel',
                  onResolve: (selected, indices) => {
                      const trashedCard = selected[0];
                      setPlayers(prevPlayers => {
                          const p = prevPlayers[playerIdx];
                          const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                          return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand } : pl);
                      });
                      setTrash(prev => [...prev, trashedCard]);
                      addLog(`${player.name} trashed ${trashedCard.name}.`);
                      
                      queueInteraction({
                          id: `remodel-gain-${Date.now()}-${i}`,
                          type: 'SUPPLY_SELECTION',
                          source: 'Remodel',
                          min: 1, max: 1,
                          targetPlayerIndex: playerIdx,
                          filter: (c) => c.cost <= trashedCard.cost + 2,
                          filterMessage: `Cost max ${trashedCard.cost + 2}`,
                          onResolve: (gained) => {
                              const c = gained[0];
                              setSupply(prev => ({ ...prev, [c.id]: prev[c.id] - 1 }));
                              setPlayers(prevPlayers => prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, discard: [...pl.discard, c] } : pl));
                              addLog(`${player.name} remodeled into ${c.name}.`);
                          }
                      });
                  }
              });
          }
          
          if (card.id === 'moneylender') {
              queueInteraction({
                  id: `moneylender-${Date.now()}-${i}`,
                  type: 'HAND_SELECTION',
                  source: 'Moneylender',
                  min: 0, max: 1,
                  targetPlayerIndex: playerIdx,
                  filter: (c) => c.id === 'copper',
                  filterMessage: 'Trash a Copper (Optional)',
                  confirmLabel: 'Confirm',
                  onResolve: (selected, indices) => {
                      if (selected.length > 0) {
                          setPlayers(prevPlayers => {
                              const p = prevPlayers[playerIdx];
                              const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                              return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand, gold: pl.gold + 3 } : pl);
                          });
                          setTrash(prev => [...prev, ...selected]);
                          addLog(`${player.name} trashed a Copper for +3 Gold.`);
                      } else {
                          addLog(`${player.name} chose not to trash a Copper.`);
                      }
                  }
              });
          }
          
          if (card.id === 'poacher') {
               const emptyPiles = Object.values(supply).filter(v => v === 0).length;
               if (emptyPiles > 0) {
                   const discardCount = Math.min(emptyPiles, drawnHand.length);
                   queueInteraction({
                       id: `poacher-${Date.now()}-${i}`,
                       type: 'HAND_SELECTION',
                       source: 'Poacher',
                       min: discardCount, max: discardCount,
                       targetPlayerIndex: playerIdx,
                       confirmLabel: `Discard ${discardCount} Cards`,
                       onResolve: (selected, indices) => {
                           setPlayers(prevPlayers => {
                               const p = prevPlayers[playerIdx];
                               const remainingHand = p.hand.filter((_, idx) => !indices.includes(idx));
                               const updatedDiscard = [...p.discard, ...selected];
                               return prevPlayers.map((pl, idx) => idx === playerIdx ? { ...pl, hand: remainingHand, discard: updatedDiscard } : pl);
                           });
                           addLog(`${player.name} discarded ${discardCount} cards due to empty piles.`);
                       }
                   });
               }
          }

          if (card.id === 'militia') {
              players.forEach((p, pIdx) => {
                  if (pIdx === playerIdx) return;
                  if (p.hand.length <= 3) return; 
                  if (p.hand.some(c => c.id === 'moat')) {
                      newLog.push(`${p.name} blocks Militia with Moat.`);
                      return;
                  }

                  const discardCount = p.hand.length - 3;
                  queueInteraction({
                      id: `militia-${p.name}-${Date.now()}`,
                      type: 'HAND_SELECTION',
                      source: `Militia Attack (${p.name})`,
                      targetPlayerIndex: pIdx,
                      min: discardCount, max: discardCount,
                      confirmLabel: 'Discard Down to 3',
                      onResolve: (selected, indices) => {
                          setPlayers(prevPlayers => {
                              const victim = prevPlayers[pIdx];
                              const remHand = victim.hand.filter((_, idx) => !indices.includes(idx));
                              const upDiscard = [...victim.discard, ...selected];
                              return prevPlayers.map((pl, idx) => idx === pIdx ? { ...pl, hand: remHand, discard: upDiscard } : pl);
                          });
                          addLog(`${p.name} discarded down to 3 cards.`);
                      }
                  });
              });
          }

          if (card.id === 'bandit') {
               // Attack part
               players.forEach((p, pIdx) => {
                   if (pIdx === playerIdx) return;
                   if (p.hand.some(c => c.id === 'moat')) {
                       newLog.push(`${p.name} blocks Bandit with Moat.`);
                       return;
                   }
                   
                   // Reveal top 2
                   // We need to access the LATEST player state inside the loop, 
                   // but standard variables are stale. We must rely on functional state updates carefully
                   // or snapshot the data.
                   // NOTE: For simplicity in this engine, we assume the 'p' from the closure is "fresh enough" 
                   // or we use a functional update chain.
                   
                   // Actually, we must interact with the deck.
                   // Let's queue an interaction that auto-resolves or requires confirmation to proceed.
                   queueInteraction({
                       id: `bandit-${p.name}-${Date.now()}`,
                       type: 'CONFIRMATION',
                       source: `Bandit Attack (${p.name})`,
                       min: 0, max: 0,
                       targetPlayerIndex: pIdx, // Victim sees this
                       confirmLabel: 'Reveal Cards',
                       filterMessage: `${player.name} plays Bandit. Reveal top 2 cards?`,
                       onResolve: () => {
                           setPlayers(prevPlayers => {
                               const victim = prevPlayers[pIdx];
                               const { newDeck: vDeck, newDiscard: vDiscard, newHand: revealed } = drawCards(2, victim.deck, victim.discard, []);
                               
                               // Find treasure to trash
                               const treasureToTrash = revealed.find(c => c.type === CardType.TREASURE && c.id !== 'copper');
                               const kept = revealed.filter(c => c !== treasureToTrash);
                               
                               if (treasureToTrash) {
                                   setTrash(t => [...t, treasureToTrash]);
                                   addLog(`${victim.name} trashed ${treasureToTrash.name} due to Bandit.`);
                               } else {
                                   addLog(`${victim.name} revealed no trashable treasures.`);
                               }
                               
                               return prevPlayers.map((pl, idx) => idx === pIdx ? {
                                   ...pl,
                                   deck: vDeck,
                                   discard: [...vDiscard, ...kept]
                               } : pl);
                           });
                       }
                   });
               });
          }

          if (card.id === 'council_room') {
               players.forEach((p, pIdx) => {
                   if (pIdx === playerIdx) return;
                   // Others draw 1 card
                   setPlayers(prevPlayers => {
                       const other = prevPlayers[pIdx];
                       const { newDeck: d, newDiscard: disc, newHand: h } = drawCards(1, other.deck, other.discard, other.hand);
                       return prevPlayers.map((pl, idx) => idx === pIdx ? { ...pl, deck: d, discard: disc, hand: h } : pl);
                   });
                   newLog.push(`${p.name} draws a card.`);
               });
          }
          
          if (card.id === 'bureaucrat') {
               const silver = CARDS['silver'];
               if (supply['silver'] > 0) {
                   setSupply(prev => ({ ...prev, silver: prev.silver - 1 }));
                   newDeck = [...newDeck, silver];
                   addLog(`${player.name} put a Silver on their deck.`);
               }
               // Bureaucrat Attack: Each other player puts a Victory card from hand onto deck
               players.forEach((p, pIdx) => {
                   if (pIdx === playerIdx) return;
                   if (p.hand.some(c => c.id === 'moat')) {
                       newLog.push(`${p.name} blocks Bureaucrat with Moat.`);
                       return;
                   }
                   
                   const victoryCards = p.hand.filter(c => c.type === CardType.VICTORY || c.type === CardType.CURSE); // Curse counts as Victory in some rules, usually separate, but standard says Victory card.
                   // Actually Curse is not Victory.
                   const validVictory = p.hand.filter(c => c.type === CardType.VICTORY);
                   
                   if (validVictory.length > 0) {
                       queueInteraction({
                           id: `bureaucrat-${p.name}-${Date.now()}`,
                           type: 'HAND_SELECTION',
                           source: `Bureaucrat Attack (${p.name})`,
                           min: 1, max: 1,
                           targetPlayerIndex: pIdx,
                           filter: (c) => c.type === CardType.VICTORY,
                           filterMessage: 'Put a Victory card on your deck',
                           confirmLabel: 'Topdeck',
                           onResolve: (selected, indices) => {
                               const c = selected[0];
                               setPlayers(prevPlayers => {
                                   const pl = prevPlayers[pIdx];
                                   const remHand = pl.hand.filter((_, idx) => !indices.includes(idx));
                                   return prevPlayers.map((u, i) => i === pIdx ? { ...u, hand: remHand, deck: [...u.deck, c] } : u);
                               });
                               addLog(`${p.name} put a ${c.name} on their deck.`);
                           }
                       });
                   } else {
                       // Reveal hand to show no victory cards
                       // For simplicity, we just log it. 
                       addLog(`${p.name} shows a hand with no Victory cards.`);
                   }
               });
          }

          if (card.id === 'throne_room') {
              addLog(`> ${player.name} must choose an Action to duplicate.`);
              setActionMultiplier(2); 
          } else if (isAction) {
              setActionMultiplier(1);
          }
      }

      // Update Player with stats
      let updatedPlayers = players.map((p, i) => i === playerIdx ? {
          ...p, hand: drawnHand, playArea: newPlayArea, actions: newActions, buys: newBuys, gold: newGold, deck: newDeck, discard: newDiscard
      } : p);

      // Simple Witch Logic (Immediate)
      if (card.id === 'witch' && supply['curse'] > 0) {
         let cursesLeft = supply['curse'];
         for(let i=0; i<timesToPlay; i++) {
             updatedPlayers = updatedPlayers.map((p, pIdx) => {
                 if (pIdx === playerIdx) return p;
                 if (p.hand.some(c => c.id === 'moat')) {
                     if(i===0) newLog.push(`${p.name} blocks with Moat.`);
                     return p;
                 }
                 if (cursesLeft > 0) {
                     cursesLeft--;
                     newLog.push(`${p.name} gains a Curse.`);
                     return { ...p, discard: [...p.discard, CARDS['curse']] };
                 }
                 return p;
             });
         }
         setSupply(prev => ({ ...prev, curse: cursesLeft }));
      }
      
      setPlayers(updatedPlayers);
      if (gameMode === 'LOCAL') setLog(newLog);

      if (gameMode === 'ONLINE_HOST') {
          sendFullStateUpdate(updatedPlayers, supply, turnCount, currentPlayerIndex, newLog);
      }
  }

  function executeBuyCard(playerIdx: number, cardId: string) {
      const player = players[playerIdx];
      const card = CARDS[cardId];
      if (!card) return;
      
      // Validation
      if ((supply[cardId] || 0) < 1) {
          addLog("Cannot buy: Pile is empty.");
          return;
      }
      if (player.buys < 1) {
          addLog("Cannot buy: No buys remaining.");
          return;
      }
      if (player.gold < card.cost) {
          addLog("Cannot buy: Insufficient gold.");
          return;
      }

      if (gameMode === 'LOCAL' || gameMode === 'ONLINE_HOST') playSfx('buy');

      // Update Supply
      const newSupply = { ...supply, [cardId]: supply[cardId] - 1 };
      setSupply(newSupply);

      // Update Player
      const newPlayers = players.map((p, idx) => {
          if (idx !== playerIdx) return p;
          return {
              ...p,
              gold: p.gold - card.cost,
              buys: p.buys - 1,
              discard: [...p.discard, card]
          };
      });
      setPlayers(newPlayers);

      const newLog = [...log, `${player.name} bought ${card.name}.`];
      setLog(newLog);

      if (gameMode === 'ONLINE_HOST') {
          sendFullStateUpdate(newPlayers, newSupply, turnCount, currentPlayerIndex, newLog);
      }

      if (checkGameOver(newSupply)) {
          setGameOver(true);
      }
  }

  function executePlayAllTreasures(playerIdx: number) {
      const player = players[playerIdx];
      const treasures = player.hand.filter(c => c.type === CardType.TREASURE);
      if (treasures.length === 0) return;

      if (gameMode === 'LOCAL' || gameMode === 'ONLINE_HOST') playSfx('buy');

      const totalValue = treasures.reduce((sum, c) => sum + (c.value || 0), 0);
      const newHand = player.hand.filter(c => c.type !== CardType.TREASURE);
      const newPlayArea = [...player.playArea, ...treasures];

      const newPlayers = players.map((p, idx) => {
          if (idx !== playerIdx) return p;
          return {
              ...p,
              hand: newHand,
              playArea: newPlayArea,
              gold: p.gold + totalValue
          };
      });
      setPlayers(newPlayers);

      const newLog = [...log, `${player.name} played all treasures (+${totalValue} Gold).`];
      setLog(newLog);

      if (gameMode === 'ONLINE_HOST') {
          sendFullStateUpdate(newPlayers, supply, turnCount, currentPlayerIndex, newLog);
      }
  }

  function executeEndTurn(playerIdx: number) {
      setIsEndingTurn(true);
      const player = players[playerIdx];

      // Cleanup
      const cardsToDiscard = [...player.hand, ...player.playArea];
      const newDiscard = [...player.discard, ...cardsToDiscard];
      
      const { newDeck, newDiscard: deckRefilledDiscard, newHand } = drawCards(5, player.deck, newDiscard, []);
      
      const updatedPlayer = {
          ...player,
          hand: newHand,
          deck: newDeck,
          discard: deckRefilledDiscard,
          playArea: [],
          actions: 1,
          buys: 1,
          gold: 0
      };

      const nextPlayerIndex = (playerIdx + 1) % players.length;
      const nextTurnCount = nextPlayerIndex === 0 ? turnCount + 1 : turnCount;
      
      const newPlayers = players.map((p, i) => i === playerIdx ? updatedPlayer : p);
      
      setPlayers(newPlayers);
      
      setTimeout(() => {
          setCurrentPlayerIndex(nextPlayerIndex);
          setTurnCount(nextTurnCount);
          setActionMultiplier(1);
          setInteractionQueue([]); 
          setIsEndingTurn(false);
          
          if (gameMode === 'LOCAL') {
              setIsTransitioning(true);
          }
          
          const newLog = [...log, `${player.name} ended turn`];
          setLog(newLog);

          if (gameMode === 'ONLINE_HOST') {
              sendFullStateUpdate(newPlayers, supply, nextTurnCount, nextPlayerIndex, newLog);
          }
      }, 500);
  }

  // --- Render ---

  // NEW: AAA Boot Sequence Loading Screen
  if (isLoading) {
      return (
          // The main container background is intentionally transparent to reveal the box art from index.html
          <div className="min-h-screen flex flex-col justify-end pb-12 p-0 relative overflow-hidden select-none bg-boot">
              <div className="atmosphere-noise"></div>
              <div className="vignette"></div>
              <EmberParticles />
              
              {/* Bottom Area: Tips & Bar */}
              <div className="relative z-50 w-full flex flex-col items-center px-8 md:px-32 lg:px-64 gap-6 animate-in fade-in slide-in-from-bottom-5 duration-1000">
                  
                  {/* Tip / Lore Container */}
                  <div className="h-8 flex items-center justify-center text-center max-w-4xl">
                      <p className="text-[#e6c888] font-serif text-sm md:text-lg italic tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-pulse" key={loadingText}>
                          {loadingText}
                      </p>
                  </div>

                  {/* Ornate Loading Bar */}
                  <div className="w-full max-w-2xl flex flex-col gap-2">
                      <div className="flex justify-between text-[#8a6e38] font-sans font-bold text-[10px] uppercase tracking-[0.2em] px-1">
                          <span>Loading Assets</span>
                          <span>{Math.floor(loadingProgress)}%</span>
                      </div>
                      <div className="w-full h-1 bg-black/50 border border-[#3e2723] relative rounded-full overflow-hidden shadow-heavy backdrop-blur-sm">
                          <div 
                              className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#8a6e38] via-[#ffd700] to-[#e6c888] shadow-[0_0_15px_rgba(197,160,89,0.6)] transition-all duration-100 ease-out"
                              style={{ width: `${loadingProgress}%` }}
                          >
                              <div className="absolute right-0 top-0 bottom-0 w-2 bg-white blur-[2px] opacity-70"></div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (!hasStarted) {
      return (
        <div className="min-h-screen flex items-end justify-center p-0 relative overflow-hidden bg-menu w-full h-full animate-in fade-in duration-1000">
           {/* Global Atmosphere - using background from index.html */}
           <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none z-10"></div>
           <EmberParticles />

           <div className="w-full max-w-4xl flex flex-col items-center justify-end relative z-20 pb-12 lg:pb-20 animate-in fade-in zoom-in duration-1000 px-6">
               
               {/* Subtitle floating above menu - Replacing the big title since it's in the art */}
               <div className="mb-8 text-center bg-black/60 backdrop-blur-md p-4 rounded-xl border border-[#c5a059]/30 shadow-heavy">
                   <p className="text-[#e6c888] font-serif text-lg md:text-xl tracking-[0.4em] uppercase font-bold text-emboss drop-shadow-lg">
                       A Deck-Building Conquest
                   </p>
               </div>
              
               {!showOnlineMenu ? (
                  <div className="w-full max-w-2xl flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        <button 
                          onClick={() => { setGameMode('LOCAL'); setHasStarted(true); setShowGameSetup(true); }} 
                          className="group relative overflow-hidden bg-[#1a120b]/90 border border-[#5d4037] hover:border-[#c5a059] p-6 flex items-center gap-4 transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-md rounded-lg"
                        >
                            <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#281a16] to-[#0f0a06] border border-[#5d4037] flex items-center justify-center group-hover:border-[#c5a059] transition-colors shrink-0 shadow-token">
                              <Users size={20} className="text-[#8a6e38] group-hover:text-[#ffd700] drop-shadow-md" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-serif font-bold text-xl text-[#c5a059] group-hover:text-[#e6c888] transition-colors tracking-wide">Local Play</div>
                                <div className="text-[10px] text-[#5d4037] font-sans font-bold uppercase tracking-widest mt-0.5">Pass & Play</div>
                            </div>
                            <ChevronRight className="text-[#3e2723] group-hover:text-[#c5a059] transition-colors" />
                        </button>

                        <button 
                          onClick={() => setShowOnlineMenu(true)} 
                          className="group relative overflow-hidden bg-[#1a120b]/90 border border-[#5d4037] hover:border-[#c5a059] p-6 flex items-center gap-4 transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-md rounded-lg"
                        >
                            <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#281a16] to-[#0f0a06] border border-[#5d4037] flex items-center justify-center group-hover:border-[#c5a059] transition-colors shrink-0 shadow-token">
                              <Wifi size={20} className="text-[#8a6e38] group-hover:text-[#ffd700] drop-shadow-md" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-serif font-bold text-xl text-[#c5a059] group-hover:text-[#e6c888] transition-colors tracking-wide">Online Realms</div>
                                <div className="text-[10px] text-[#5d4037] font-sans font-bold uppercase tracking-widest mt-0.5">Host or Join</div>
                            </div>
                            <ChevronRight className="text-[#3e2723] group-hover:text-[#c5a059] transition-colors" />
                        </button>
                    </div>
                    
                    <button 
                      onClick={() => setShowGuide(true)}
                      className="group relative overflow-hidden bg-[#0f0a06]/80 border border-[#3e2723] hover:border-[#8a6e38] p-4 flex items-center justify-center gap-3 transition-all duration-300 hover:bg-[#1a120b]/90 shadow-md backdrop-blur-sm rounded-lg"
                    >
                       <BookOpen size={16} className="text-[#5d4037] group-hover:text-[#e6c888] transition-colors" />
                       <span className="text-[#8a6e38] font-serif font-bold uppercase tracking-widest text-sm group-hover:text-[#c5a059] transition-colors">Consult the Archives (Rules)</span>
                    </button>
                  </div>
              ) : (
                  <div className="w-full max-w-lg bg-[#1a120b]/95 backdrop-blur-md border border-[#c5a059]/30 p-8 animate-in fade-in slide-in-from-bottom-10 shadow-[0_0_100px_rgba(0,0,0,0.8)] relative z-20 rounded-lg">
                      <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-[#c5a059]"></div>
                      <div className="absolute -top-1 -right-1 w-2 h-2 border-t border-r border-[#c5a059]"></div>
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b border-l border-[#c5a059]"></div>
                      <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-[#c5a059]"></div>

                      <h2 className="text-2xl text-[#c5a059] font-serif mb-6 border-b border-[#3e2723] pb-4 text-center tracking-widest uppercase">Online Lobby</h2>
                      
                      <div className="space-y-4">
                        <button onClick={() => { setGameMode('ONLINE_HOST'); initHost(); setShowGameSetup(true); setHasStarted(true); }} className="w-full py-4 bg-[#2c1e16] text-[#e6c888] font-serif font-bold text-lg border border-[#5d4037] hover:border-[#c5a059] hover:bg-[#3e2723] transition-all shadow-heavy tracking-wide rounded-sm">
                            Host a New Realm
                        </button>
                        
                        <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-[#3e2723]"></div>
                            <span className="flex-shrink-0 mx-4 text-[#5d4037] text-[10px] uppercase tracking-[0.2em] font-sans font-bold">Or Join Existing</span>
                            <div className="flex-grow border-t border-[#3e2723]"></div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <input type="text" placeholder="Enter Host ID..." className="w-full bg-[#0f0a06] border border-[#3e2723] text-parchment p-3 font-mono text-center outline-none focus:border-[#c5a059] transition-colors placeholder:text-[#3e2723] text-lg shadow-inner-deep rounded-sm" value={hostIdInput} onChange={e => setHostIdInput(e.target.value)} />
                            <button onClick={joinGame} className="w-full py-4 bg-[#1a120b] text-[#8a6e38] font-serif font-bold border border-[#3e2723] hover:text-[#c5a059] hover:border-[#8a6e38] transition-all text-lg tracking-wide uppercase rounded-sm">Join Game</button>
                        </div>
                      </div>
                      <button onClick={() => setShowOnlineMenu(false)} className="text-xs text-[#5d4037] hover:text-[#8a6e38] mt-6 w-full text-center hover:underline uppercase tracking-widest font-sans font-bold block">Return to Main Menu</button>
                  </div>
              )}
           </div>

           {/* GAME GUIDE MODAL */}
           {showGuide && (
             <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setShowGuide(false)}>
                <div className="bg-[#e3dcd2] bg-parchment-texture border-4 border-[#3e2723] max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl relative rounded-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="p-6 bg-[#d1c7b7]/80 border-b-2 border-[#3e2723] flex justify-between items-center relative">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-10 pointer-events-none"></div>
                        <h2 className="text-[#3e2723] font-serif text-3xl font-bold uppercase tracking-widest drop-shadow-sm flex items-center gap-3">
                           <BookOpen size={28}/> Rules of Engagement
                        </h2>
                        <button onClick={() => setShowGuide(false)} className="text-[#5d4037] hover:text-[#3e2723] transition-colors z-10"><X size={32}/></button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 font-serif text-[#1a120b] text-lg leading-relaxed shadow-inner-deep">
                        <section>
                            <h3 className="text-[#8a6e38] font-bold uppercase tracking-[0.2em] mb-2 border-b border-[#3e2723]/20 pb-1">The Goal</h3>
                            <p>Construct the most prosperous kingdom. The game ends when the <span className="font-bold text-[#5e1b1b]">Province</span> pile is empty, or any <span className="font-bold">three Supply piles</span> run out. The player with the most <span className="font-bold text-[#15803d]">Victory Points (VP)</span> in their deck wins.</p>
                        </section>

                        <section>
                            <h3 className="text-[#8a6e38] font-bold uppercase tracking-[0.2em] mb-2 border-b border-[#3e2723]/20 pb-1">Turn Structure</h3>
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-[#334155] text-white flex items-center justify-center font-sans font-bold shrink-0 mt-1">A</div>
                                    <div>
                                        <h4 className="font-bold text-[#3e2723]">Action Phase</h4>
                                        <p className="text-sm">You start with <span className="font-bold">1 Action</span>. You may play Action cards from your hand. Playing Actions can give you more cards, coins, buys, or actions to chain combos.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-[#b45309] text-white flex items-center justify-center font-sans font-bold shrink-0 mt-1">B</div>
                                    <div>
                                        <h4 className="font-bold text-[#3e2723]">Buy Phase</h4>
                                        <p className="text-sm">You start with <span className="font-bold">1 Buy</span>. First, play any Treasure cards from your hand to generate Gold. Then, buy cards from the Supply using your total Gold. Bought cards go to your <span className="font-bold">Discard Pile</span>.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-[#5d4037] text-white flex items-center justify-center font-sans font-bold shrink-0 mt-1">C</div>
                                    <div>
                                        <h4 className="font-bold text-[#3e2723]">Cleanup Phase</h4>
                                        <p className="text-sm">All played cards and remaining cards in your hand are placed in your <span className="font-bold">Discard Pile</span>. Draw <span className="font-bold">5 new cards</span> from your Deck. If your Deck is empty, shuffle your Discard Pile to form a new Deck.</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                    
                    {/* Footer */}
                    <div className="p-4 bg-[#d1c7b7] border-t border-[#3e2723] text-center text-xs font-sans font-bold text-[#5d4037] uppercase tracking-widest">
                        May fortune favor your reign
                    </div>
                </div>
             </div>
           )}
        </div>
      );
  }

  if (showGameSetup) {
      if (gameMode === 'LOCAL') {
        return (
          <div className="min-h-screen bg-transparent flex items-center justify-center p-4 relative z-50 overflow-hidden">
             {/* Dark overlay to make setup legible over box art */}
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0"></div>
             <div className="atmosphere-noise"></div>
             <div className="vignette"></div>
             <EmberParticles />
             <div className="bg-[#1a120b] border-2 border-[#5d4037] p-4 md:p-8 max-w-6xl w-full h-[90vh] flex flex-col shadow-heavy relative z-10 animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-8"><h2 className="text-3xl md:text-4xl font-serif text-[#c5a059] mb-2 tracking-widest uppercase text-shadow-heavy">Setup Game</h2><p className="text-[#5d4037] font-sans font-bold text-xs uppercase tracking-[0.2em]">Choose your scenario</p></div>
                <div className="mb-8 flex justify-center items-center gap-8 bg-[#0f0a06] p-4 border-y border-[#3e2723] shadow-inner-deep max-w-md mx-auto">
                    <span className="text-[#8a6e38] font-sans uppercase tracking-widest font-bold text-xs">Players</span>
                    <div className="flex gap-4">
                        {[2, 3, 4].map(num => (<button key={num} onClick={() => setPlayerCountMode(num)} className={`w-12 h-12 bg-[#1a120b] border border-[#3e2723] font-serif font-bold text-xl flex items-center justify-center transition-all shadow-token ${playerCountMode === num ? 'border-[#c5a059] text-[#e6c888] scale-110 shadow-outer-glow' : 'text-[#5d4037] hover:text-[#8a6e38]'}`}>{num}</button>))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 scrollbar-thin">
                    {BOARD_SETUPS.map(board => (
                        <button key={board.id} onClick={() => setSelectedBoardId(board.id)} className={`p-6 bg-[#0f0a06] border border-[#3e2723] text-left transition-all hover:border-[#8a6e38] group ${selectedBoardId === board.id ? 'border-[#c5a059] bg-[#1a120b]' : ''}`}>
                            <div className="flex justify-between items-start mb-4">
                                <h3 className={`font-serif text-xl font-bold tracking-wide ${selectedBoardId === board.id ? 'text-[#c5a059]' : 'text-[#8a6e38] group-hover:text-[#c5a059]'}`}>{board.name}</h3>
                                {selectedBoardId === board.id && <Crown size={16} className="text-[#c5a059]" />}
                            </div>
                            <div className="text-xs text-[#5d4037] font-sans leading-relaxed">
                                {board.description}
                            </div>
                        </button>
                    ))}
                </div>
                <div className="mt-8 flex justify-center"><button onClick={() => initGame(selectedBoardId, playerCountMode)} className="bg-[#2c1e16] hover:bg-[#3e2723] text-[#e6c888] font-serif font-bold py-4 px-16 border border-[#5d4037] hover:border-[#c5a059] shadow-heavy uppercase tracking-[0.2em] transition-all flex items-center gap-3 active:scale-95"><span>Start Conquest</span></button></div>
             </div>
          </div>
        );
      } else {
         return (
             <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
                 {/* Dark overlay */}
                 <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0"></div>
                 <div className="atmosphere-noise"></div>
                 <EmberParticles />
                 <div className="bg-[#1a120b] border border-[#5d4037] p-10 max-w-2xl w-full text-center shadow-heavy relative z-10 animate-in fade-in">
                     <h2 className="text-3xl font-serif text-[#c5a059] mb-8 uppercase tracking-widest">Hosting Game</h2>
                     <div className="bg-[#0f0a06] p-8 border border-[#3e2723] mb-8 shadow-inner-deep">
                         <p className="text-[#5d4037] text-xs mb-4 uppercase tracking-[0.2em] font-sans font-bold">Share Realm ID</p>
                         <div className="flex items-center justify-center gap-6"><span className="font-mono text-3xl text-[#e6c888] tracking-widest">{peerId || '...'}</span><button onClick={() => navigator.clipboard.writeText(peerId)} className="text-[#5d4037] hover:text-[#c5a059] transition-colors"><Copy /></button></div>
                     </div>
                     <div className="mb-10">
                         <h3 className="text-[#8a6e38] font-serif mb-6 flex items-center justify-center gap-2 uppercase tracking-wide text-sm">Connected Lords ({connectedPeers.length + 1})</h3>
                         <div className="space-y-3">
                             <div className="p-4 bg-[#2c1e16] border border-[#5d4037] text-[#e6c888] font-bold flex items-center justify-between px-8 shadow-md"><span>You (Host)</span> <div className="w-2 h-2 bg-[#c5a059] rounded-full shadow-[0_0_10px_#c5a059]"></div></div>
                             {connectedPeers.map((pId, idx) => (<div key={pId} className="p-4 bg-[#2c1e16] border border-[#3e2723] text-[#8a6e38] flex items-center justify-between px-8 shadow-md"><span>Player {idx + 2}</span> <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_green]"></div></div>))}
                         </div>
                     </div>
                     <div className="flex gap-4 justify-center"><button onClick={() => setHasStarted(false)} className="px-8 py-4 border border-[#3e2723] text-[#5d4037] hover:text-[#8a6e38] uppercase tracking-widest text-xs font-sans font-bold">Cancel</button><button disabled={connectedPeers.length < 1} onClick={() => initGame('first_game', connectedPeers.length + 1)} className="px-10 py-4 bg-[#1a120b] text-[#e6c888] font-serif font-bold border border-[#5d4037] hover:border-[#c5a059] disabled:opacity-30 uppercase tracking-widest transition-all">Start Game</button></div>
                 </div>
             </div>
         );
      }
  }

  if (isTransitioning && gameMode === 'LOCAL' && !gameOver) {
      return (
          <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/98 p-6 animate-in fade-in duration-500">
             <div className="atmosphere-noise"></div>
             <EmberParticles />
             <div className="text-center border-y-2 border-[#5d4037] p-16 bg-[#1a120b] shadow-heavy max-w-3xl relative">
                 <h2 className="text-2xl text-[#8a6e38] font-serif mb-4 uppercase tracking-widest">Turn Complete</h2><p className="text-[#5d4037] mb-12 font-sans text-xs uppercase tracking-[0.2em] font-bold">Pass device to</p><h1 className="text-7xl text-[#c5a059] font-serif font-bold mb-16 text-shadow-heavy">{players[currentPlayerIndex].name}</h1><button onClick={() => {setIsTransitioning(false); addLog(`> It is now ${players[currentPlayerIndex].name}'s turn.`);}} className="bg-[#2c1e16] text-[#e6c888] font-serif font-bold text-xl py-6 px-20 border border-[#5d4037] hover:border-[#c5a059] hover:bg-[#3e2723] transition-all uppercase tracking-widest shadow-heavy">Begin Turn</button>
             </div>
          </div>
      );
  }
  
  return (
    <div className="min-h-screen font-sans flex flex-col h-screen overflow-hidden relative select-none bg-game">
      <div className="atmosphere-noise"></div>
      <div className="vignette"></div>
      <EmberParticles />

      {/* Floating Text */}
      <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
        {floatingTexts.map(ft => <div key={ft.id} className={`absolute animate-float-up text-3xl md:text-5xl font-serif font-black ${ft.color} drop-shadow-[0_4px_8px_rgba(0,0,0,1)] text-shadow-heavy`}>{ft.text}</div>)}
      </div>

      {/* Game Over Modal */}
      {gameOver && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-700">
            <div className="bg-[#1a120b] border-2 border-[#c5a059] p-6 md:p-12 max-w-4xl w-full text-center shadow-heavy texture-wood overflow-y-auto max-h-[90vh] relative">
                 <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#c5a059] to-transparent opacity-50"></div>
                 <Trophy size={60} className="mx-auto text-[#c5a059] mb-4 md:mb-8 drop-shadow-[0_0_20px_rgba(197,160,89,0.3)]" /><h2 className="text-4xl md:text-6xl font-serif text-[#e6c888] mb-4 text-shadow-heavy uppercase tracking-widest">Game Over</h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-12 mt-8 md:mt-12">
                     {players.map(p => (
                        <div key={p.id} className="bg-[#0f0a06] p-4 md:p-6 border border-[#3e2723] shadow-inner-deep flex justify-between items-center group"><span className="text-[#8a6e38] font-serif font-bold text-xl md:text-2xl group-hover:text-[#c5a059] transition-colors">{p.name}</span><span className="text-4xl md:text-5xl font-bold text-[#e6c888] font-serif drop-shadow-md">{calculateScore(p)} <span className="text-xs text-[#5d4037] uppercase tracking-widest font-sans font-bold">VP</span></span></div>
                     ))}
                 </div>
                 <button onClick={() => { setHasStarted(false); setGameOver(false); }} className="w-full bg-[#2c1e16] text-[#e6c888] font-serif font-bold py-6 px-10 border border-[#5d4037] hover:border-[#c5a059] uppercase tracking-[0.3em] transition-all shadow-heavy">Return to Menu</button>
            </div>
        </div>
      )}

      {/* Game Menu Modal */}
      {gameMenuOpen && (
          <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setGameMenuOpen(false)}>
              <div className="bg-[#1a120b] border-2 border-[#3e2723] p-8 w-full max-w-md shadow-heavy" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-[#c5a059] font-serif text-2xl uppercase tracking-widest">Game Menu</h2>
                      <button onClick={() => setGameMenuOpen(false)} className="text-[#5d4037] hover:text-[#8a6e38]"><X size={24} /></button>
                  </div>
                  <div className="space-y-4">
                      <button onClick={() => setIsMuted(!isMuted)} className="w-full py-4 bg-[#0f0a06] text-[#8a6e38] border border-[#3e2723] hover:border-[#c5a059] hover:text-[#c5a059] flex items-center justify-center gap-4 transition-all uppercase tracking-wide font-bold">
                          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />} {isMuted ? "Unmute Audio" : "Mute Audio"}
                      </button>
                      <button onClick={() => { setHasStarted(false); setGameOver(false); peerRef.current?.destroy(); }} className="w-full py-4 bg-[#2c1e16] text-[#e6c888] border border-[#5d4037] hover:border-[#ef4444] hover:text-[#ef4444] flex items-center justify-center gap-4 transition-all uppercase tracking-wide font-bold">
                          <RotateCcw size={20} /> Reset Game
                      </button>
                  </div>
                  {gameMode !== 'LOCAL' && (
                      <div className="mt-8 pt-6 border-t border-[#3e2723] text-center">
                          <p className="text-[#5d4037] text-xs uppercase tracking-widest font-bold mb-2">Connected as</p>
                          <p className="text-[#e6c888] font-serif text-lg">{myPlayerId === 0 ? 'Host' : `Client (Player ${myPlayerId! + 1})`}</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Log Modal */}
      {isLogOpen && (
          <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4 md:p-12 animate-in fade-in" onClick={() => setIsLogOpen(false)}>
              <div className="bg-[#e3dcd2] bg-parchment-texture border-2 border-[#3e2723] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-heavy relative rounded-sm" onClick={e => e.stopPropagation()}>
                  <div className="p-4 md:p-6 border-b border-[#3e2723]/20 flex justify-between items-center bg-[#d1c7b7]/50">
                      <h2 className="text-[#3e2723] font-serif text-xl md:text-3xl uppercase tracking-widest font-bold">Chronicles</h2>
                      <button onClick={() => setIsLogOpen(false)} className="text-[#5d4037] hover:text-[#3e2723]"><X size={24} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-3 font-serif text-base md:text-xl text-[#1a120b] shadow-inner-deep">
                      {log.map((entry, i) => <div key={i} className={`border-b border-[#3e2723]/10 pb-2 leading-relaxed ${entry.startsWith('>') ? 'font-bold text-[#5e1b1b]' : 'text-[#3e2723]'}`}>{entry}</div>)}
                      <div ref={logEndRef} />
                  </div>
              </div>
          </div>
      )}

      {/* NEW: Card Purchase Confirmation Modal */}
      {viewingSupplyCard && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={() => setViewingSupplyCard(null)}>
              <div className="flex flex-col items-center gap-8 md:gap-12 animate-in zoom-in-50 duration-300" onClick={e => e.stopPropagation()}>
                  {/* Large Card Display */}
                  <div className="transform scale-125 md:scale-150 mb-12 md:mb-24">
                      <CardDisplay card={viewingSupplyCard} disabled={false} />
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col items-center gap-4 relative z-10">
                      {/* Affordability & Availability Check */}
                      {(() => {
                          const currentCount = supply[viewingSupplyCard.id] || 0;
                          const canAfford = activePlayer && activePlayer.gold >= viewingSupplyCard.cost;
                          const hasBuys = activePlayer && activePlayer.buys > 0;
                          const isAvailable = currentCount > 0;
                          
                          let lockReason = "";
                          if (!isAvailable) lockReason = "Empty Pile";
                          else if (!hasBuys) lockReason = "No Buys Remaining";
                          else if (!canAfford) lockReason = "Insufficient Funds";

                          if (lockReason) {
                              return (
                                  <button disabled className="bg-[#1a120b] text-[#5d4037] font-serif font-bold text-xl md:text-2xl py-4 px-12 md:px-16 border-2 border-[#3e2723] uppercase tracking-[0.2em] flex items-center gap-4 cursor-not-allowed opacity-80">
                                      <Lock size={24} />
                                      <span>{lockReason}</span>
                                  </button>
                              );
                          }
                          
                          return (
                              <button 
                                onClick={confirmBuyCard}
                                className="bg-[#2c1e16] hover:bg-[#3e2723] text-[#e6c888] font-serif font-bold text-xl md:text-2xl py-4 px-12 md:px-16 border-2 border-[#5d4037] hover:border-[#c5a059] shadow-[0_0_30px_rgba(197,160,89,0.3)] hover:shadow-[0_0_50px_rgba(197,160,89,0.6)] uppercase tracking-[0.2em] transition-all flex items-center gap-4 group active:scale-95"
                              >
                                  <ShoppingBag className="group-hover:text-[#ffd700] transition-colors" />
                                  <span>Purchase</span>
                              </button>
                          );
                      })()}
                      
                      <button 
                        onClick={() => setViewingSupplyCard(null)} 
                        className="text-[#5d4037] hover:text-[#e3dcd2] uppercase tracking-widest font-sans font-bold text-sm transition-colors mt-2"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* INTERACTION OVERLAY */}
      {isInteracting && currentInteraction && (
          <div className="fixed inset-x-0 bottom-[16rem] md:bottom-[40vh] z-[70] flex justify-center animate-in fade-in slide-in-from-bottom-5">
              <div className="bg-[#1a120b]/90 border-y-2 border-[#c5a059] p-6 shadow-[0_0_100px_rgba(0,0,0,0.9)] flex flex-col items-center gap-4 backdrop-blur-xl max-w-xl w-full text-center relative">
                  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#c5a059] to-transparent"></div>
                  <div className="text-[#c5a059] font-serif font-bold text-xl uppercase tracking-[0.2em] flex items-center gap-3 drop-shadow-md">
                      <Sparkles size={20} className="text-[#e6c888]" /> {currentInteraction.source}
                  </div>
                  <p className="text-[#e3dcd2] text-sm font-sans font-bold tracking-wide leading-relaxed">
                      {currentInteraction.filterMessage || (currentInteraction.type === 'SUPPLY_SELECTION' ? 'Choose a card from the Supply' : `Select ${currentInteraction.min} to ${currentInteraction.max === -1 ? 'any' : currentInteraction.max} cards`)}
                  </p>
                  
                  {currentInteraction.type === 'CUSTOM_SELECTION' && currentInteraction.customCards && (
                      <div className="flex gap-4 overflow-x-auto p-4 max-w-full">
                          {currentInteraction.customCards.map((c, idx) => (
                              <div key={idx} className={`relative transform transition-all duration-300 ${selectedHandIndices.includes(idx) ? 'scale-110 -translate-y-2 z-10' : 'hover:scale-105'}`}>
                                  <CardDisplay card={c} small onClick={() => handleHandCardClick(idx)} selected={selectedHandIndices.includes(idx)} />
                              </div>
                          ))}
                      </div>
                  )}

                  {(currentInteraction.type === 'HAND_SELECTION' || currentInteraction.type === 'CONFIRMATION' || currentInteraction.type === 'CUSTOM_SELECTION') && (
                      <button 
                        onClick={handleConfirmInteraction}
                        // Allow 0 cards if min is 0
                        disabled={currentInteraction.min > 0 && selectedHandIndices.length < currentInteraction.min}
                        className="bg-[#2c1e16] text-[#e6c888] px-10 py-3 border border-[#5d4037] font-serif font-bold hover:border-[#c5a059] hover:bg-[#3e2723] transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-3 shadow-md uppercase tracking-widest text-xs mt-2"
                      >
                         <Check size={14} /> {currentInteraction.confirmLabel || 'Confirm'}
                      </button>
                  )}
                  {currentInteraction.type === 'SUPPLY_SELECTION' && (
                      <div className="text-[10px] text-[#5d4037] font-sans font-bold uppercase tracking-widest animate-pulse mt-2">Click a Supply pile to gain...</div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#c5a059] to-transparent"></div>
              </div>
          </div>
      )}

      {/* Discard Modal */}
      {isDiscardOpen && activePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-8" onClick={() => setIsDiscardOpen(false)}>
            <div className="bg-[#1a120b] border border-[#5d4037] w-full max-w-5xl max-h-[80vh] flex flex-col shadow-heavy relative" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-[#3e2723] flex justify-between items-center bg-[#0f0a06]"><h2 className="text-2xl font-serif text-[#c5a059] uppercase tracking-widest">Discard Pile <span className="text-[#5d4037] text-lg">({activePlayer.discard.length})</span></h2><button onClick={() => setIsDiscardOpen(false)} className="text-[#5d4037] hover:text-[#c5a059] transition-colors"><X size={24} /></button></div>
                <div className="flex-1 overflow-y-auto p-10 bg-[#0f0a06]/50 grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4 md:gap-6 scrollbar-thin">
                    {activePlayer.discard.map((card, idx) => <div key={idx} className="relative group hover:scale-105 transition-transform"><CardDisplay small card={card} /></div>)}
                </div>
            </div>
        </div>
      )}

      {/* Trash Modal */}
      {isTrashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-8" onClick={() => setIsTrashOpen(false)}>
            <div className="bg-[#1a120b] border border-[#5d4037] w-full max-w-5xl max-h-[80vh] flex flex-col shadow-heavy relative" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-[#3e2723] flex justify-between items-center bg-[#0f0a06]"><h2 className="text-2xl font-serif text-[#c5a059] uppercase tracking-widest">Trash Pile <span className="text-[#5d4037] text-lg">({trash.length})</span></h2><button onClick={() => setIsTrashOpen(false)} className="text-[#5d4037] hover:text-[#c5a059] transition-colors"><X size={24} /></button></div>
                <div className="flex-1 overflow-y-auto p-10 bg-[#0f0a06]/50 grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4 md:gap-6 scrollbar-thin">
                    {trash.map((card, idx) => <div key={idx} className="relative group hover:scale-105 transition-transform"><CardDisplay small card={card} disabled /></div>)}
                    {trash.length === 0 && <div className="col-span-full text-center text-[#5d4037] italic">The trash is empty... for now.</div>}
                </div>
            </div>
        </div>
      )}

      {/* Main Board */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden z-10 relative">
        {/* NEW TOP HEADER BAR */}
        <div className="bg-[#1a120b]/90 border-b border-[#3e2723] shadow-heavy p-4 flex justify-between items-center relative z-50 backdrop-blur-md shrink-0">
           {/* Left: Menu & Title */}
           <div className="flex items-center gap-4">
              <button onClick={() => setGameMenuOpen(true)} className="text-[#c5a059] p-2 border border-[#3e2723] bg-[#0f0a06] hover:border-[#8a6e38] hover:text-[#e6c888] transition-colors rounded-md shadow-inner-deep">
                  <Menu size={24} />
              </button>
              <h1 className="hidden md:block text-2xl font-serif text-[#c5a059] tracking-[0.2em] uppercase font-bold text-shadow-heavy">Wickinion</h1>
           </div>

           {/* Center: Resources */}
           <div className="flex gap-6 md:gap-16">
              <ResourceCounter value={currentPlayer?.actions || 0} label="Actions" icon={<Zap size={10} />} />
              <ResourceCounter value={currentPlayer?.buys || 0} label="Buys" icon={<Coins size={10} />} />
              <ResourceCounter value={currentPlayer?.gold || 0} label="Gold" icon={<Coins size={10} className="text-[#ffd700]" />} />
           </div>

           {/* Right: Actions (Trash, Log) & Player Summary */}
           <div className="flex items-center gap-3">
              {/* Player Summary (Compact) - Hidden on very small screens */}
               <div className="hidden lg:flex gap-2 mr-4">
                  {players.map(p => (
                      <div key={p.id} className={`flex items-center gap-2 text-[10px] font-bold uppercase px-3 py-1 border rounded-sm transition-colors ${p.id === currentPlayerIndex ? 'border-[#c5a059] text-[#c5a059] bg-[#3e2723]/30 shadow-[0_0_10px_rgba(197,160,89,0.2)]' : 'border-[#3e2723] text-[#5d4037] bg-[#0f0a06]'}`}>
                          <User size={12} /> {p.name} <div className="flex items-center gap-1 text-white/50 ml-1"><Trophy size={10} className="text-[#c5a059]"/>{calculateScore(p)}</div>
                      </div>
                  ))}
               </div>

               <button onClick={toggleFullScreen} className="text-[#5d4037] hover:text-[#c5a059] p-2 hover:bg-[#3e2723]/30 rounded transition-colors hidden md:block" title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}>
                  {isFullScreen ? <Minimize size={24} /> : <Maximize size={24} />}
               </button>

               <button onClick={() => setIsTrashOpen(true)} className="text-[#5d4037] hover:text-[#ef4444] p-2 hover:bg-[#3e2723]/30 rounded transition-colors" title="Trash Pile">
                  <Trash2 size={24} />
               </button>
               <button onClick={() => setIsLogOpen(true)} className="text-[#5d4037] hover:text-[#e6c888] p-2 hover:bg-[#3e2723]/30 rounded transition-colors relative" title="Game Log">
                  <Scroll size={24} />
                  {/* Notification dot if log updated? omitted for simplicity */}
               </button>
           </div>
        </div>

        {/* Play Area & Supply */}
        <div className="flex-1 overflow-y-auto p-2 pb-64 md:pb-10 md:p-10 lg:p-4 2xl:p-20 space-y-8 md:space-y-12 lg:space-y-4 2xl:space-y-24 scrollbar-none relative">
          {actionMultiplier > 1 && !isInteracting && (
            <div className="bg-[#5e1b1b] text-[#e6c888] text-center p-4 border border-[#c5a059] shadow-[0_0_30px_rgba(94,27,27,0.6)] mb-6 animate-pulse flex items-center justify-center gap-3">
                <Repeat size={16}/>
                <span className="font-serif font-bold tracking-widest uppercase text-sm">Throne Room Active</span>
            </div>
          )}
          <div className={`flex flex-col gap-6 md:gap-10 lg:gap-4 2xl:gap-16 max-w-[95%] xl:max-w-7xl 2xl:max-w-[90%] mx-auto transition-opacity duration-300 ${isInteracting && currentInteraction?.type === 'HAND_SELECTION' ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
             {/* Supply Rendering */}
             {['Royal Treasury', 'Lands & Titles', 'The Marketplace'].map((section, idx) => {
                 const type = idx === 0 ? CardType.TREASURE : idx === 1 ? CardType.VICTORY : 'KINGDOM';
                 const icon = idx === 0 ? <Coins className="text-[#ffd700]"/> : idx === 1 ? <MapIcon className="text-green-500"/> : <Sword className="text-stone-400"/>;
                 const cards = type === 'KINGDOM' ? Object.keys(supply).filter(k => !['TREASURE','VICTORY','CURSE'].includes(CARDS[k].type)).map(k => ({...CARDS[k], count: supply[k]})) 
                              : Object.keys(supply).filter(k => CARDS[k].type === type).map(k => ({...CARDS[k], count: supply[k]}));
                 if (cards.length === 0) return null;
                 return (
                     <div key={section} className="relative pt-2 md:pt-6 lg:pt-1">
                         <div className="flex items-center gap-4 mb-4 md:mb-6 lg:mb-2 2xl:mb-10 border-b border-[#3e2723]/50 pb-2">
                             <h3 className="text-[#8a6e38] font-serif font-bold text-xs md:text-sm 2xl:text-xl flex items-center gap-2 uppercase tracking-[0.3em]">{icon} {section}</h3>
                             <div className="h-[1px] flex-1 bg-gradient-to-r from-[#3e2723] to-transparent"></div>
                         </div>
                         {/* Supply cards grid adjusted for responsiveness */}
                         <div className={`grid ${idx===2?'grid-cols-3 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6':'grid-cols-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-4'} gap-1 md:gap-2 lg:gap-2 2xl:gap-4 place-items-center`}>
                             {cards.map(c => {
                                 // Supply Interaction Highlight
                                 const isHighlight = isInteracting && currentInteraction?.type === 'SUPPLY_SELECTION' && (!currentInteraction.filter || currentInteraction.filter(c));
                                 return (
                                     <div key={c.id} className="relative perspective-1000">
                                         {isHighlight && <div className="absolute -inset-2 z-30 animate-pulse border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] rounded-lg pointer-events-none"></div>}
                                         <CardDisplay 
                                            small 
                                            card={c} 
                                            count={c.count} 
                                            // Enable click if Buy Phase OR if Interacting with supply
                                            disabled={
                                                isInteracting 
                                                    ? (!currentInteraction || currentInteraction.type !== 'SUPPLY_SELECTION' || (currentInteraction.filter && !currentInteraction.filter(c)))
                                                    : (!isMyTurn)
                                            } 
                                            onClick={() => handleSupplyCardClick(c.id)} 
                                            onMouseEnter={() => setHoveredCard(c)} 
                                            onMouseLeave={() => setHoveredCard(null)} 
                                         />
                                     </div>
                                 )
                             })}
                         </div>
                     </div>
                 )
             })}
             {supply['curse'] > 0 && <div className="relative pt-6 w-min mx-auto"><div className="flex items-center justify-center gap-4 mb-4"><h3 className="text-[#5e1b1b] font-serif font-bold text-xs 2xl:text-lg flex items-center gap-2 uppercase tracking-[0.3em]"><Skull size={14} className="text-[#5e1b1b]"/> Curses</h3></div><div className="mt-2"><CardDisplay small card={CARDS['curse']} disabled count={supply['curse']} /></div></div>}
          </div>

          <section className="min-h-[160px] md:min-h-[220px] lg:min-h-[140px] xl:min-h-[180px] 2xl:min-h-[400px] rounded-sm p-4 md:p-10 lg:p-6 2xl:p-16 mt-8 md:mt-12 lg:mt-6 flex flex-col items-center relative bg-[#0f0a06]/60 border-y border-[#3e2723] shadow-inner-deep">
             <div className="absolute inset-0 bg-[#000000] opacity-30 pointer-events-none"></div>
            <h2 className="text-[#3e2723] text-[10px] md:text-xs 2xl:text-lg uppercase tracking-[0.5em] text-center mb-4 md:mb-8 lg:mb-4 font-sans font-bold border-b border-[#3e2723] pb-2 w-48 2xl:w-64 relative z-10">Battlefield</h2>
            <div className="flex flex-wrap justify-center gap-2 md:gap-4 lg:gap-2 2xl:gap-8 relative z-10 perspective-1000">
              {currentPlayer?.playArea.map((card, idx) => <div key={idx} className={`transform transition-all duration-300 ${isEndingTurn ? 'animate-discard-play' : 'animate-play'} shadow-heavy scale-75 md:scale-90 lg:scale-75 xl:scale-90 2xl:scale-100`}><CardDisplay card={card} disabled /></div>)}
              {currentPlayer?.playArea.length === 0 && <div className="w-full text-center text-[#3e2723] italic py-8 font-serif text-sm 2xl:text-xl tracking-widest opacity-50">The field is empty...</div>}
            </div>
          </section>
        </div>
        
        {hoveredCard && <div className="absolute bottom-6 left-6 z-[100] hidden md:block animate-in fade-in zoom-in duration-200 pointer-events-none"><div className="shadow-[0_0_50px_rgba(0,0,0,1)]"><CardDisplay card={hoveredCard} disabled /></div></div>}
        
        {/* Hand */}
        {activePlayer && (
        <div className={`border-t border-[#3e2723] bg-[#0f0a06]/95 p-2 md:p-4 lg:p-2 2xl:p-8 shadow-[0_-20px_60px_rgba(0,0,0,1)] z-30 fixed bottom-0 left-0 right-0 md:relative transition-all duration-500 backdrop-blur-md ${isInteracting ? 'brightness-50 grayscale-[0.5]' : ''}`}>
          
          {/* Phase Badge */}
          <div className="absolute -top-3 md:-top-5 lg:-top-4 2xl:-top-8 left-1/2 transform -translate-x-1/2 bg-[#0f0a06] border border-[#3e2723] text-parchment px-6 md:px-10 2xl:px-16 py-1 md:py-2 2xl:py-3 shadow-heavy font-sans font-bold text-[8px] md:text-[10px] lg:text-[8px] 2xl:text-base tracking-[0.3em] flex items-center gap-4 md:gap-6 z-0">
             {activePlayerIndex !== currentPlayerIndex ? (
                 <span className="text-red-500 flex items-center gap-2 animate-pulse"><ShieldAlert size={12}/> DEFEND</span>
             ) : (
                 <>
                    <span className={`${currentPhase === 'ACTION PHASE' && !isInteracting ? 'text-[#c5a059] drop-shadow-glow' : 'text-[#3e2723]'}`}>ACTION</span><span className="text-[#3e2723]">|</span><span className={`${currentPhase === 'BUY PHASE' && !isInteracting ? 'text-[#c5a059] drop-shadow-glow' : 'text-[#3e2723]'}`}>BUY</span>
                 </>
             )}
          </div>

          <div className="flex justify-between items-center mb-2 md:mb-4 px-2 md:px-8 max-w-7xl 2xl:max-w-[90%] mx-auto w-full relative z-10">
             <div className="flex items-center gap-4">
                 <h2 className={`text-[#8a6e38] font-serif tracking-[0.3em] text-[10px] md:text-xs 2xl:text-lg uppercase font-bold text-shadow-heavy ${activePlayerIndex !== currentPlayerIndex ? 'text-red-900' : ''}`}>{activePlayer.name}</h2>
                 <button onClick={() => setIsDiscardOpen(true)} className="lg:hidden text-[8px] md:text-[10px] text-[#5d4037] hover:text-[#8a6e38] uppercase tracking-widest font-bold">Discard ({activePlayer.discard.length})</button>
             </div>
             <button onClick={handlePlayAllTreasures} disabled={gameOver || isEndingTurn || !isMyTurn || isInteracting} className="text-[8px] md:text-[10px] 2xl:text-sm bg-[#1a120b] hover:bg-[#2c1e16] text-[#c5a059] px-4 md:px-6 2xl:px-10 py-2 md:py-3 2xl:py-4 border border-[#3e2723] hover:border-[#8a6e38] uppercase tracking-[0.2em] font-sans font-bold transition-all shadow-md disabled:opacity-20 disabled:grayscale">Play All Treasure</button>
          </div>
          
          {/* PLAYER HAND AREA */}
          <div className="flex items-end justify-center w-full max-w-7xl 2xl:max-w-[90%] mx-auto gap-8 relative z-10 perspective-1000 min-h-[140px] md:min-h-[14rem] lg:min-h-[12rem] xl:min-h-[14rem] 2xl:min-h-[28rem] overflow-x-auto md:overflow-visible pb-2 md:pb-0 hide-scrollbar">
             
             {/* LEFT: DECK (Now Full Size Card Stack) */}
             <div className="hidden lg:flex flex-col items-center mb-6 2xl:mb-12 opacity-90 hover:opacity-100 transition-opacity" title={`${activePlayer.deck.length} cards in deck`}>
                 <div className="relative w-48 h-72 lg:w-24 lg:h-36 xl:w-32 xl:h-48 2xl:w-72 2xl:h-[28rem] card-3d-wrapper hover:scale-105 transition-transform duration-300 origin-bottom-left scale-75 xl:scale-90">
                      {/* Physical Stack Effect */}
                      {activePlayer.deck.length > 1 && <div className="absolute top-1 left-1 w-full h-full bg-[#1a0f0a] rounded-lg border border-[#3e2723] shadow-heavy transform translate-z-[-2px]"></div>}
                      {activePlayer.deck.length > 2 && <div className="absolute top-2 left-2 w-full h-full bg-[#1a0f0a] rounded-lg border border-[#3e2723] shadow-heavy transform translate-z-[-4px]"></div>}
                      
                      {/* Top Card Back */}
                      <div className="absolute inset-0 bg-[#281a16] rounded-xl border-4 border-[#5d4037] shadow-heavy card-back-pattern flex items-center justify-center overflow-hidden">
                          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] opacity-20"></div>
                          <div className="w-16 h-16 lg:w-12 lg:h-12 xl:w-16 xl:h-16 2xl:w-40 2xl:h-40 rounded-full border-4 border-[#5d4037] flex items-center justify-center bg-[#1a0f0a] shadow-inner-deep">
                              <Crown size={48} className="text-[#8a6e38] drop-shadow-lg lg:w-6 lg:h-6 xl:w-8 xl:h-8 2xl:w-20 2xl:h-20" />
                          </div>
                      </div>
                 </div>
                 <span className="text-[10px] 2xl:text-sm text-[#8a6e38] mt-2 font-sans uppercase tracking-[0.3em] font-bold">Deck ({activePlayer.deck.length})</span>
             </div>

             {/* CENTER: HAND CARDS */}
             <div className="flex-1 flex overflow-visible pb-4 md:pb-10 lg:pb-6 2xl:pb-20 gap-0 px-4 justify-center items-end origin-bottom transform scale-[0.85] md:scale-100" style={{perspective: '1000px'}}>
                 {activePlayer.hand.map((card, idx) => {
                  const isAction = card.type === CardType.ACTION || card.type === CardType.REACTION;
                  const isTreasure = card.type === CardType.TREASURE;
                  
                  let disabled = false;
                  if (isInteracting) {
                      if (currentInteraction?.type !== 'HAND_SELECTION' && currentInteraction?.type !== 'CUSTOM_SELECTION') disabled = true;
                  } else {
                      const isActionPlayable = isAction && (activePlayer.actions > 0 || actionMultiplier > 1);
                      if (!isMyTurn || gameOver || isEndingTurn || (!isActionPlayable && !isTreasure)) disabled = true;
                      if (activePlayerIndex !== currentPlayerIndex) disabled = true;
                  }

                  const isSelected = selectedHandIndices.includes(idx);
                  
                  // Fanning Calculation
                  const total = activePlayer.hand.length;
                  const center = (total - 1) / 2;
                  const dist = idx - center;
                  const rotate = dist * 2; 
                  const translateY = Math.abs(dist) * 2; 

                  return (
                    <div key={`${idx}-${card.id}`} 
                         className={`relative transition-all duration-300 -ml-6 md:-ml-12 lg:-ml-10 xl:-ml-12 2xl:-ml-24 first:ml-0 ${isEndingTurn ? 'animate-discard-hand' : 'animate-draw'} ${!disabled ? 'hover:z-50' : ''}`} 
                         style={{ 
                             zIndex: idx,
                             transform: isSelected ? `translateY(-40px) rotate(0deg)` : `rotate(${rotate}deg) translateY(${translateY}px)`,
                             animationDelay: `${idx * 0.05}s` 
                         }}>
                      <CardDisplay 
                          card={card} 
                          disabled={disabled} 
                          shake={shakingCardId === `${idx}-${card.id}`}
                          selected={isSelected}
                          onClick={() => {
                              if (isMyTurn && !gameOver && !isEndingTurn) handleHandCardClick(idx);
                          }} 
                      />
                    </div>
                  );
                 })}
                 {activePlayer.hand.length === 0 && <div className="text-[#3e2723] italic py-10 w-full text-center font-serif text-sm tracking-widest opacity-50">Empty Hand</div>}
                 
                 {/* FLOATING END TURN BUTTON */}
                 {!gameOver && !isInteracting && isMyTurn && (
                   <div className="relative z-40 animate-in fade-in zoom-in duration-300 ml-4 md:ml-8 mb-8 md:mb-20 2xl:mb-32 self-center">
                      {currentPlayer.actions <= 0 && currentPlayer.buys <= 0 && (
                        <>
                          <div className="absolute inset-0 rounded-full bg-[#ef4444] opacity-20 animate-ping pointer-events-none"></div>
                          <div className="absolute -inset-4 rounded-full bg-[#c5a059] opacity-10 animate-pulse pointer-events-none blur-xl"></div>
                        </>
                      )}

                      <button 
                        onClick={handleEndTurn} 
                        disabled={isEndingTurn}
                        className={`
                          group relative w-16 h-16 md:w-28 md:h-28 lg:w-16 lg:h-16 xl:w-20 xl:h-20 2xl:w-40 2xl:h-40 rounded-full flex flex-col items-center justify-center 
                          bg-gradient-to-b from-[#7f1d1d] via-[#450a0a] to-[#2a0a0a]
                          border-[3px] border-[#c5a059] 
                          shadow-[0_10px_20px_rgba(0,0,0,0.8),inset_0_2px_10px_rgba(255,255,255,0.2)]
                          transition-all duration-300 
                          hover:scale-110 hover:shadow-[0_0_30px_rgba(197,160,89,0.6)] hover:border-[#ffd700]
                          active:scale-95 active:translate-y-1
                        `}
                      >
                          <div className="absolute inset-1 rounded-full border border-[#991b1b] bg-gradient-to-br from-transparent to-black/50 pointer-events-none"></div>
                          <div className="absolute -inset-[2px] rounded-full border border-[#8a6e38] opacity-50 pointer-events-none"></div>
                          <div className="relative z-10 mb-1">
                              <div className="absolute inset-0 bg-[#ffd700] blur-md opacity-0 group-hover:opacity-40 transition-opacity duration-300"></div>
                              <Hourglass 
                                className="text-[#e6c888] group-hover:text-[#fff] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] transition-colors duration-300 lg:w-6 lg:h-6 2xl:w-12 2xl:h-12" 
                                size={20} 
                                strokeWidth={2.5}
                              />
                          </div>
                          <span className="relative z-10 text-[#e6c888] font-serif font-black text-[6px] md:text-[10px] lg:text-[8px] 2xl:text-sm tracking-[0.25em] uppercase group-hover:text-[#ffd700] text-shadow-heavy transition-colors duration-300 hidden md:block">
                              {isEndingTurn ? 'Ending' : 'End Turn'}
                          </span>
                      </button>
                   </div>
                 )}
             </div>

             {/* RIGHT: DISCARD (Full Size Card Stack) */}
             <button onClick={() => setIsDiscardOpen(true)} className="hidden lg:flex flex-col items-center mb-6 2xl:mb-12 cursor-pointer hover:scale-105 transition-transform relative group origin-bottom-right scale-75 xl:scale-90">
                 <div className="relative w-48 h-72 lg:w-24 lg:h-36 xl:w-32 xl:h-48 2xl:w-72 2xl:h-[28rem]">
                     {activePlayer.discard.length === 0 ? (
                        <div className="w-full h-full bg-[#0f0a06] border-4 border-dashed border-[#3e2723] rounded-xl flex items-center justify-center shadow-inner-deep">
                            <span className="text-[#3e2723] text-sm font-sans uppercase tracking-widest">Empty</span>
                        </div>
                     ) : (
                        <div className="relative w-full h-full">
                            {activePlayer.discard.length > 1 && <div className="absolute top-1 right-1 w-full h-full bg-black/50 rounded-xl transform rotate-2"></div>}
                            <div className="relative z-10 w-full h-full shadow-heavy group-hover:rotate-2 transition-transform duration-300">
                                <CardDisplay card={activePlayer.discard[activePlayer.discard.length-1]} />
                            </div>
                        </div>
                     )}
                     <div className="absolute -top-3 -right-3 w-10 h-10 2xl:w-16 2xl:h-16 bg-[#1a120b] text-[#e6c888] border border-[#5d4037] flex items-center justify-center text-lg 2xl:text-2xl font-bold z-20 shadow-heavy rounded-full">
                        {activePlayer.discard.length}
                     </div>
                 </div>
                 <span className="text-[10px] 2xl:text-sm text-[#5d4037] mt-2 font-sans uppercase tracking-[0.3em] font-bold group-hover:text-[#8a6e38]">Discard</span>
             </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}