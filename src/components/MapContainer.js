"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
  update
} from "firebase/database";
import { motion, AnimatePresence } from "framer-motion";
import ProximityChat from "@/components/ProximityChat";
import VirtualJoystick from "@/components/VirtualJoystick";
import { auth, db } from "@/lib/firebase";
import { distance } from "@/lib/proximity";

// ============================================
// FEATURE CONFIG - Easy toggle for scary features
// ============================================
const ENABLE_ENHANCED_SCARY_MODE = true; // Set to false to disable aggressive NPCs during night override
import {
  clearCanvas,
  drawBackground,
  drawFootprint,
  drawFootprintTrail,
  drawNPC,
  drawDialogueBox,
  drawChattingIndicator,
  drawCandlelightEffect,
  drawParchmentTexture,
  drawBurntEdges,
  drawRoomLabels,
  drawSecretPassages,
  drawMovingStaircases,
  drawHouseZone,
  drawCurfewWarning,
  drawSpellEffect,
  drawOwlDelivery,
  drawCurfewDarkness,
  drawScaryNPC,
  getTimeOfDay,
  isCurfew,
  screenToWorld,
  worldToScreen
} from "@/lib/canvas";
import {
  initializeNPCs,
  initializeScaryNPCs,
  updateNPCPosition,
  getNPCDialogue,
  checkNPCProximity,
  serializeNPCsForFirebase,
  mergeNPCsFromFirebase
} from "@/lib/npcs";

const STEP = 12;
const CHAT_RADIUS = 50;
const WHISPER_RADIUS = 25;
const NPC_INTERACTION_RADIUS = 100;
const DEFAULT_POSITION = { x: 240, y: 240 };
const ACTIVE_WINDOW_MS = 30000;
const HEARTBEAT_MS = 10000;
const IDLE_MS = 5 * 60 * 1000;
const IDLE_CHECK_MS = 10000;
const ROOM_CAP = 20;
const ROOM_PREFIX = "room-";
const NPC_SYNC_MS = 2000;
const TRAIL_MAX_LENGTH = 15;
const TRAIL_POINT_INTERVAL = 100;
const STEP_INTERVAL_WALK = 180; // ms between steps when walking
const STEP_INTERVAL_RUN = 100;  // ms between steps when running
const HOUSES = ["Gryffindor", "Slytherin", "Ravenclaw", "Hufflepuff"];

const getRandomHouse = () => HOUSES[Math.floor(Math.random() * HOUSES.length)];
const normalizeName = (value) => value.trim().toLowerCase();
const getRoomNumber = (roomId) => Number(roomId.replace(ROOM_PREFIX, "")) || 0;

const getActiveUsers = (users) => {
  const now = Date.now();
  return Object.values(users || {}).filter((user) => {
    const lastSeen = user?.updatedAt || 0;
    return now - lastSeen <= ACTIVE_WINDOW_MS && !user?.banned;
  });
};

const resolveRoomId = (rooms) => {
  const roomEntries = Object.entries(rooms || {}).sort(
    ([a], [b]) => getRoomNumber(a) - getRoomNumber(b)
  );

  for (const [roomId, room] of roomEntries) {
    const activeCount = getActiveUsers(room?.users || {}).length;
    if (activeCount < ROOM_CAP) {
      return roomId;
    }
  }

  const maxRoomNumber = roomEntries.length
    ? Math.max(...roomEntries.map(([roomId]) => getRoomNumber(roomId)))
    : 0;
  return `${ROOM_PREFIX}${maxRoomNumber + 1}`;
};

export default function MapContainer() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const mapImageRef = useRef(null);
  const trailRef = useRef([]);
  const lastTrailTimeRef = useRef(0);
  const lastStepTimeRef = useRef(0);
  const dialogueBoxesRef = useRef([]);
  const otherUsersTrailsRef = useRef({}); // Track footprint trails for other users
  
  // Touch handling refs
  const touchStartRef = useRef({ x: 0, y: 0 });
  const lastPinchDistRef = useRef(0);
  const isTouchDraggingRef = useRef(false);

  const [userId, setUserId] = useState(null);
  const [house, setHouse] = useState(getRandomHouse());
  const [name, setName] = useState("");
  const [hasProfile, setHasProfile] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [selfPosition, setSelfPosition] = useState(DEFAULT_POSITION);
  const [users, setUsers] = useState({});
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blocksData, setBlocksData] = useState({});
  const [showBlockList, setShowBlockList] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [chatStatuses, setChatStatuses] = useState({});
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeTarget, setActiveTarget] = useState(null);
  const [chatHistory, setChatHistory] = useState({}); // Persists chat history during session
  const [lastMoveAt, setLastMoveAt] = useState(Date.now());

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [minZoom, setMinZoom] = useState(0.5); // Will be updated to fit-to-screen zoom
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [npcs, setNpcs] = useState([]);
  const [activeNPC, setActiveNPC] = useState(null);
  const [npcDialogue, setNpcDialogue] = useState(null);
  const [isNPCMaster, setIsNPCMaster] = useState(false);

  // Immersive UI state
  const [showBlockPanel, setShowBlockPanel] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [isMapClosing, setIsMapClosing] = useState(false);
  const [owlDeliveries, setOwlDeliveries] = useState([]);
  const [spellEffects, setSpellEffects] = useState([]);
  const [whisperMode, setWhisperMode] = useState(false);
  const [movementDirection, setMovementDirection] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  // Tutorial/Guide state
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  // Feedback system state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const feedbackTimerRef = useRef(null);
  const sessionStartRef = useRef(Date.now());

  // Curfew & Scary NPC state
  const [lumosActive, setLumosActive] = useState(false);
  const [lumosFlash, setLumosFlash] = useState(false); // Double-click Lumos Maxima effect
  const [nightOverride, setNightOverride] = useState(false); // Manual override toggle
  const [showNightWarning, setShowNightWarning] = useState(false); // Warning modal for override
  const [scaryNPCs, setScaryNPCs] = useState([]);
  const [scaryEncounter, setScaryEncounter] = useState(null); // { npc, dialogue }
  const [scaredMessage, setScaredMessage] = useState(null); // Message after escaping NPC
  const [isPlayerFrozen, setIsPlayerFrozen] = useState(false);
  const [freezeEndTime, setFreezeEndTime] = useState(0);
  const [isChatMaximized, setIsChatMaximized] = useState(false); // Full screen chat mode
  const encounterCooldownRef = useRef({}); // Track cooldown per NPC
  const lastLumosClickRef = useRef(0); // For double-click detection
  
  // Computed states for curfew logic:
  // - Real night = isCurfew() returns true (9PM-6AM)
  // - Real day = isCurfew() returns false
  const isRealNight = isCurfew();
  
  // When to show darkness:
  // - Real night WITHOUT override = dark (need Lumos)
  // - Real night WITH override = daylight (no darkness, no Lumos needed)
  // - Real day WITHOUT override = daylight (normal)
  // - Real day WITH override = dark (need Lumos)
  const showDarkness = (isRealNight && !nightOverride) || (!isRealNight && nightOverride);
  
  // When scary NPCs are active:
  // - Real night (always) OR day with override
  const scaryNPCsActive = isRealNight || nightOverride;
  
  // Enhanced scary mode: override during real night (most dangerous!)
  const isEnhancedScaryMode = ENABLE_ENHANCED_SCARY_MODE && nightOverride && isRealNight;

  // Load map image and auto-fit to screen
  useEffect(() => {
    const img = new Image();
    img.src = "/hogwarts-map.jpg";
    img.onload = () => {
      mapImageRef.current = img;
      setMapLoaded(true);
    };
  }, []);

  // Auto-fit map to screen when loaded
  useEffect(() => {
    if (!mapLoaded || !mapImageRef.current || !canvasSize.width || !canvasSize.height) return;
    
    const img = mapImageRef.current;
    const scaleX = canvasSize.width / img.width;
    const scaleY = canvasSize.height / img.height;
    const fitZoom = Math.max(scaleX, scaleY); // Use max to cover entire screen
    
    // Set minimum zoom to fit-to-screen level (can't zoom out beyond this)
    setMinZoom(fitZoom);
    
    // Center the map
    const centerX = (img.width - canvasSize.width / fitZoom) / 2;
    const centerY = (img.height - canvasSize.height / fitZoom) / 2;
    
    setCamera({
      x: Math.max(0, centerX),
      y: Math.max(0, centerY),
      zoom: fitZoom
    });
  }, [mapLoaded, canvasSize.width, canvasSize.height]);

  // Initialize scary NPCs
  useEffect(() => {
    setScaryNPCs(initializeScaryNPCs());
  }, []);

  // Force re-render when time changes (for curfew state)
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Update scary NPCs positions (faster in enhanced scary mode)
  useEffect(() => {
    if (!hasProfile || scaryNPCs.length === 0) return;

    const interval = setInterval(() => {
      // Enhanced mode: NPCs move 1.5x faster
      const deltaTime = isEnhancedScaryMode ? 75 : 50;
      setScaryNPCs(prev => 
        prev.map(npc => updateNPCPosition(npc, deltaTime))
      );
    }, 50);

    return () => clearInterval(interval);
  }, [hasProfile, scaryNPCs.length, isEnhancedScaryMode]);

  // Check for scary NPC encounters (only when scary NPCs are active and NOT chatting)
  useEffect(() => {
    // Skip scary encounters when user is actively chatting
    if (!hasProfile || isPlayerFrozen || scaryEncounter || !scaryNPCsActive || activeTarget) return;
    
    // Enhanced scary mode: larger encounter radius, shorter cooldown, longer freeze
    const ENCOUNTER_RADIUS = isEnhancedScaryMode ? 120 : 80;
    const ENCOUNTER_COOLDOWN = isEnhancedScaryMode ? 8000 : 15000; // 8s vs 15s cooldown
    const FREEZE_DURATION = isEnhancedScaryMode ? 4000 : 2500; // 4s vs 2.5s freeze
    const now = Date.now();

    for (const npc of scaryNPCs) {
      const dist = distance(selfPosition, npc);
      
      // Check if within encounter radius and not on cooldown
      if (dist <= ENCOUNTER_RADIUS) {
        const lastEncounter = encounterCooldownRef.current[npc.id] || 0;
        if (now - lastEncounter > ENCOUNTER_COOLDOWN) {
          // Trigger encounter!
          const dialogue = getNPCDialogue(npc);
          setScaryEncounter({ npc, dialogue });
          setIsPlayerFrozen(true);
          setFreezeEndTime(now + FREEZE_DURATION);
          encounterCooldownRef.current[npc.id] = now;
          break;
        }
      }
    }
  }, [selfPosition, scaryNPCs, hasProfile, isPlayerFrozen, scaryEncounter, isEnhancedScaryMode, scaryNPCsActive, activeTarget]);

  // Unfreeze player after freeze duration and auto-dismiss encounter
  useEffect(() => {
    if (!isPlayerFrozen || freezeEndTime === 0) return;
    
    const timeoutId = setTimeout(() => {
      setIsPlayerFrozen(false);
      // Show scared message and close encounter
      const scaredMessages = [
        "That was terrifying! 😱",
        "My heart is still racing! 💓",
        "I need to be more careful... 😰",
        "Too close! Way too close! 😨",
        "I thought I was done for! 😱",
        "Phew... that was scary! 😅"
      ];
      setScaredMessage(scaredMessages[Math.floor(Math.random() * scaredMessages.length)]);
      setScaryEncounter(null);
      setFreezeEndTime(0);
      setTimeout(() => setScaredMessage(null), 2500);
    }, freezeEndTime - Date.now());

    return () => clearTimeout(timeoutId);
  }, [isPlayerFrozen, freezeEndTime]);

  // NPCs disabled for now
  // useEffect(() => {
  //   setNpcs(initializeNPCs());
  // }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        return;
      }
      await signInAnonymously(auth);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId || !hasProfile || !roomId) return;

    const userRef = ref(db, `rooms/${roomId}/users/${userId}`);
    const initialPayload = {
      x: DEFAULT_POSITION.x,
      y: DEFAULT_POSITION.y,
      house,
      name,
      roomId,
      isIdle: false,
      banned: false,
      lastMoveAt: Date.now(),
      updatedAt: Date.now()
    };

    set(userRef, initialPayload);
    onDisconnect(userRef).remove();

    // Cleanup function when user leaves
    const cleanupUserChats = async () => {
      remove(userRef);
      
      // Get all messages and delete chats where this user is a participant
      const messagesRef = ref(db, `rooms/${roomId}/messages`);
      const snapshot = await get(messagesRef);
      const chats = snapshot.val() || {};
      
      Object.entries(chats).forEach(([chatId, chat]) => {
        const participants = chat?.participants || {};
        if (participants[userId]) {
          // This user was in this chat, delete it
          remove(ref(db, `rooms/${roomId}/messages/${chatId}`));
        }
      });
    };

    return () => cleanupUserChats();
  }, [userId, house, name, hasProfile, roomId]);

  // Clean up orphaned chats where one participant left the room
  useEffect(() => {
    if (!roomId || !userId) return;

    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    const usersRef = ref(db, `rooms/${roomId}/users`);
    
    // Check periodically for orphaned chats
    const cleanupInterval = setInterval(async () => {
      const [messagesSnapshot, usersSnapshot] = await Promise.all([
        get(messagesRef),
        get(usersRef)
      ]);
      
      const chats = messagesSnapshot.val() || {};
      const activeUsers = usersSnapshot.val() || {};
      const activeUserIds = new Set(Object.keys(activeUsers));
      
      Object.entries(chats).forEach(([chatId, chat]) => {
        const participants = Object.keys(chat?.participants || {});
        // If any participant is no longer in the room, delete the chat
        const hasOrphanedParticipant = participants.some(uid => !activeUserIds.has(uid));
        
        if (hasOrphanedParticipant) {
          remove(ref(db, `rooms/${roomId}/messages/${chatId}`));
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId) return;

    const usersRef = ref(db, `rooms/${roomId}/users`);
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const now = Date.now();
      const activeUsers = Object.fromEntries(
        Object.entries(data).filter(([, user]) => {
          const lastSeen = user?.updatedAt || 0;
          return now - lastSeen <= ACTIVE_WINDOW_MS;
        })
      );
      setUsers(activeUsers);

      const sortedUids = Object.keys(activeUsers).sort();
      setIsNPCMaster(sortedUids[0] === userId);

      const selfRecord = data?.[userId];
      if (selfRecord?.banned) {
        setIsBanned(true);
      }
    });

    return () => unsubscribe();
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;

    const blocksRef = ref(db, `rooms/${roomId}/blocks/${userId}`);
    const unsubscribe = onValue(blocksRef, (snapshot) => {
      const data = snapshot.val() || {};
      setBlockedUsers(Object.keys(data));
    });

    return () => unsubscribe();
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId) return;

    const blocksRef = ref(db, `rooms/${roomId}/blocks`);
    const unsubscribe = onValue(blocksRef, (snapshot) => {
      setBlocksData(snapshot.val() || {});
    });

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const reportsRef = ref(db, `rooms/${roomId}/reports`);
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val() || {};

      Object.entries(data).forEach(([reportedUid, reporters]) => {
        const count = Object.keys(reporters || {}).length;
        if (count >= 3) {
          update(ref(db, `rooms/${roomId}/users/${reportedUid}`), {
            banned: true,
            bannedAt: Date.now(),
            reportsCount: count
          });
        }
      });
    });

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const nextStatuses = {};

      Object.values(data).forEach((chat) => {
        if (chat?.status?.active && chat?.status?.users) {
          Object.keys(chat.status.users).forEach((uid) => {
            nextStatuses[uid] = true;
          });
        }
      });

      setChatStatuses(nextStatuses);
    });

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (!userId || !hasProfile || !roomId) return;

    const interval = setInterval(() => {
      update(ref(db, `rooms/${roomId}/users/${userId}`), {
        x: selfPosition.x,
        y: selfPosition.y,
        updatedAt: Date.now()
      });
    }, HEARTBEAT_MS);

    return () => clearInterval(interval);
  }, [userId, hasProfile, roomId, selfPosition.x, selfPosition.y]);

  useEffect(() => {
    if (!userId || !hasProfile || !roomId) return;

    const interval = setInterval(() => {
      const idle = Date.now() - lastMoveAt >= IDLE_MS;
      update(ref(db, `rooms/${roomId}/users/${userId}`), {
        isIdle: idle
      });
    }, IDLE_CHECK_MS);

    return () => clearInterval(interval);
  }, [userId, hasProfile, roomId, lastMoveAt]);

  // NPC Firebase sync disabled
  // useEffect(() => {
  //   if (!roomId || !hasProfile) return;
  //   const npcsRef = ref(db, `rooms/${roomId}/npcs`);
  //   if (isNPCMaster) {
  //     const interval = setInterval(() => {
  //       set(npcsRef, serializeNPCsForFirebase(npcs));
  //     }, NPC_SYNC_MS);
  //     return () => clearInterval(interval);
  //   } else {
  //     const unsubscribe = onValue(npcsRef, (snapshot) => {
  //       const data = snapshot.val();
  //       if (data) {
  //         setNpcs((prev) => mergeNPCsFromFirebase(prev, data));
  //       }
  //     });
  //     return () => unsubscribe();
  //   }
  // }, [roomId, hasProfile, isNPCMaster, npcs]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    const updateSize = () => {
      // Check ref is still valid (component not unmounted)
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [hasProfile, isBanned]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!userId || !hasProfile || isBanned || isPlayerFrozen) return;

      // Don't process movement keys when typing in an input
      const activeElement = document.activeElement;
      const isTyping = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      const { key, shiftKey } = event;
      
      // Handle Escape for Mischief Managed animation (allow even when typing to close)
      if (key === "Escape" && hasProfile) {
        if (isTyping) {
          activeElement.blur(); // First escape blurs input
          return;
        }
        setIsMapClosing(true);
        return;
      }

      // Skip movement keys when typing
      if (isTyping) return;
      
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "W", "a", "A", "s", "S", "d", "D"].includes(key)) {
        return;
      }

      event.preventDefault();
      
      // Throttle steps for natural walking pace
      const now = Date.now();
      const stepInterval = shiftKey ? STEP_INTERVAL_RUN : STEP_INTERVAL_WALK;
      if (now - lastStepTimeRef.current < stepInterval) {
        return; // Too soon for next step
      }
      lastStepTimeRef.current = now;
      
      // Running with shift key
      setIsRunning(shiftKey);
      const currentStep = shiftKey ? STEP * 1.5 : STEP;

      let nextX = selfPosition.x;
      let nextY = selfPosition.y;
      let direction = movementDirection;

      switch (key) {
        case "ArrowUp":
        case "w":
        case "W":
          nextY -= currentStep;
          direction = -Math.PI / 2;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          nextY += currentStep;
          direction = Math.PI / 2;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          nextX -= currentStep;
          direction = Math.PI;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          nextX += currentStep;
          direction = 0;
          break;
        default:
          break;
      }

      setMovementDirection(direction);

      const mapWidth = mapImageRef.current?.width || 1200;
      const mapHeight = mapImageRef.current?.height || 800;
      const clampedX = Math.max(0, Math.min(nextX, mapWidth - 24));
      const clampedY = Math.max(0, Math.min(nextY, mapHeight - 24));

      setSelfPosition({ x: clampedX, y: clampedY });
      setLastMoveAt(Date.now());
      
      // Auto-pan camera when player approaches edge of screen
      const edgeMargin = 100; // pixels from edge to trigger pan
      setCamera((prev) => {
        const screenX = (clampedX - prev.x) * prev.zoom;
        const screenY = (clampedY - prev.y) * prev.zoom;
        
        let newX = prev.x;
        let newY = prev.y;
        
        // Check if player is near edges and pan camera
        if (screenX < edgeMargin) {
          newX = Math.max(0, prev.x - (edgeMargin - screenX) / prev.zoom);
        } else if (screenX > canvasSize.width - edgeMargin) {
          newX = prev.x + (screenX - (canvasSize.width - edgeMargin)) / prev.zoom;
        }
        
        if (screenY < edgeMargin) {
          newY = Math.max(0, prev.y - (edgeMargin - screenY) / prev.zoom);
        } else if (screenY > canvasSize.height - edgeMargin) {
          newY = prev.y + (screenY - (canvasSize.height - edgeMargin)) / prev.zoom;
        }
        
        // Clamp camera to map bounds
        const maxX = Math.max(0, mapWidth - canvasSize.width / prev.zoom);
        const maxY = Math.max(0, mapHeight - canvasSize.height / prev.zoom);
        
        return {
          ...prev,
          x: Math.max(0, Math.min(maxX, newX)),
          y: Math.max(0, Math.min(maxY, newY))
        };
      });
      
      update(ref(db, `rooms/${roomId}/users/${userId}`), {
        x: clampedX,
        y: clampedY,
        isIdle: false,
        isRunning: shiftKey,
        direction,
        lastMoveAt: Date.now(),
        updatedAt: Date.now()
      });
    };

    const handleKeyUp = (event) => {
      if (event.key === "Shift") {
        setIsRunning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [userId, hasProfile, isBanned, roomId, selfPosition.x, selfPosition.y, movementDirection, isPlayerFrozen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event) => {
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      setCamera((prev) => {
        const newZoom = Math.max(minZoom, Math.min(3, prev.zoom * zoomFactor));
        
        // Clamp position after zoom to keep map within bounds
        const mapWidth = mapImageRef.current?.width || 1200;
        const mapHeight = mapImageRef.current?.height || 800;
        const maxX = Math.max(0, mapWidth - canvasSize.width / newZoom);
        const maxY = Math.max(0, mapHeight - canvasSize.height / newZoom);
        
        return {
          x: Math.max(0, Math.min(maxX, prev.x)),
          y: Math.max(0, Math.min(maxY, prev.y)),
          zoom: newZoom
        };
      });
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [hasProfile, isBanned, minZoom, canvasSize.width, canvasSize.height]);

  const handleMouseDown = (event) => {
    if (event.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event) => {
    if (!isDragging) return;

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;

    setCamera((prev) => {
      const mapWidth = mapImageRef.current?.width || 1200;
      const mapHeight = mapImageRef.current?.height || 800;
      
      // Calculate max pan limits (map edge should not go inside viewport)
      const maxX = Math.max(0, mapWidth - canvasSize.width / prev.zoom);
      const maxY = Math.max(0, mapHeight - canvasSize.height / prev.zoom);
      
      return {
        ...prev,
        x: Math.max(0, Math.min(maxX, prev.x - dx / prev.zoom)),
        y: Math.max(0, Math.min(maxY, prev.y - dy / prev.zoom))
      };
    });

    setDragStart({ x: event.clientX, y: event.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (event) => {
    if (event.touches.length === 1) {
      // Single touch - start panning
      const touch = event.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      isTouchDraggingRef.current = true;
    } else if (event.touches.length === 2) {
      // Two touches - start pinch zoom
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      isTouchDraggingRef.current = false;
    }
  };

  const handleTouchMove = (event) => {
    event.preventDefault();
    
    if (event.touches.length === 1 && isTouchDraggingRef.current) {
      // Single touch - pan
      const touch = event.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      setCamera((prev) => {
        const mapWidth = mapImageRef.current?.width || 1200;
        const mapHeight = mapImageRef.current?.height || 800;
        const maxX = Math.max(0, mapWidth - canvasSize.width / prev.zoom);
        const maxY = Math.max(0, mapHeight - canvasSize.height / prev.zoom);
        
        return {
          ...prev,
          x: Math.max(0, Math.min(maxX, prev.x - dx / prev.zoom)),
          y: Math.max(0, Math.min(maxY, prev.y - dy / prev.zoom))
        };
      });

      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (event.touches.length === 2) {
      // Pinch zoom
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      
      if (lastPinchDistRef.current > 0) {
        const scale = currentDist / lastPinchDistRef.current;
        
        setCamera((prev) => {
          const newZoom = Math.max(minZoom, Math.min(3, prev.zoom * scale));
          const mapWidth = mapImageRef.current?.width || 1200;
          const mapHeight = mapImageRef.current?.height || 800;
          const maxX = Math.max(0, mapWidth - canvasSize.width / newZoom);
          const maxY = Math.max(0, mapHeight - canvasSize.height / newZoom);
          
          return {
            x: Math.max(0, Math.min(maxX, prev.x)),
            y: Math.max(0, Math.min(maxY, prev.y)),
            zoom: newZoom
          };
        });
      }
      
      lastPinchDistRef.current = currentDist;
    }
  };

  const handleTouchEnd = () => {
    isTouchDraggingRef.current = false;
    lastPinchDistRef.current = 0;
  };

  // Virtual joystick movement handler
  const handleJoystickMove = (dx, dy) => {
    if (!userId || !hasProfile || isBanned || !roomId || isPlayerFrozen) return;
    
    const now = Date.now();
    const stepInterval = isRunning ? STEP_INTERVAL_RUN : STEP_INTERVAL_WALK;
    if (now - lastStepTimeRef.current < stepInterval) return;
    lastStepTimeRef.current = now;
    
    const currentStep = isRunning ? STEP * 1.5 : STEP;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude < 0.2) return; // Dead zone
    
    const normalizedDx = dx / magnitude;
    const normalizedDy = dy / magnitude;
    
    const nextX = selfPosition.x + normalizedDx * currentStep;
    const nextY = selfPosition.y + normalizedDy * currentStep;
    const direction = Math.atan2(normalizedDy, normalizedDx);
    
    setMovementDirection(direction);
    
    const mapWidth = mapImageRef.current?.width || 1200;
    const mapHeight = mapImageRef.current?.height || 800;
    const clampedX = Math.max(0, Math.min(nextX, mapWidth - 24));
    const clampedY = Math.max(0, Math.min(nextY, mapHeight - 24));

    setSelfPosition({ x: clampedX, y: clampedY });
    setLastMoveAt(Date.now());
    
    // Auto-pan camera when player approaches edge of screen
    const edgeMargin = 100;
    setCamera((prev) => {
      const screenX = (clampedX - prev.x) * prev.zoom;
      const screenY = (clampedY - prev.y) * prev.zoom;
      
      let newX = prev.x;
      let newY = prev.y;
      
      if (screenX < edgeMargin) {
        newX = Math.max(0, prev.x - (edgeMargin - screenX) / prev.zoom);
      } else if (screenX > canvasSize.width - edgeMargin) {
        newX = prev.x + (screenX - (canvasSize.width - edgeMargin)) / prev.zoom;
      }
      
      if (screenY < edgeMargin) {
        newY = Math.max(0, prev.y - (edgeMargin - screenY) / prev.zoom);
      } else if (screenY > canvasSize.height - edgeMargin) {
        newY = prev.y + (screenY - (canvasSize.height - edgeMargin)) / prev.zoom;
      }
      
      const maxX = Math.max(0, mapWidth - canvasSize.width / prev.zoom);
      const maxY = Math.max(0, mapHeight - canvasSize.height / prev.zoom);
      
      return {
        ...prev,
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY))
      };
    });
    
    update(ref(db, `rooms/${roomId}/users/${userId}`), {
      x: clampedX,
      y: clampedY,
      isIdle: false,
      isRunning,
      direction,
      lastMoveAt: Date.now(),
      updatedAt: Date.now()
    });
  };

  const handleCanvasClick = (event) => {
    if (isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    for (const box of dialogueBoxesRef.current) {
      if (
        screenX >= box.x &&
        screenX <= box.x + box.width &&
        screenY >= box.y &&
        screenY <= box.y + box.height
      ) {
        const npc = npcs.find((n) => n.id === box.npcId);
        if (npc) {
          const dialogue = getNPCDialogue(npc);
          setNpcDialogue({ npc, text: dialogue });
        }
        return;
      }
    }

    const worldPos = screenToWorld(screenX, screenY, camera);
    for (const npc of npcs) {
      const dist = Math.sqrt(
        Math.pow(worldPos.x - npc.x, 2) + Math.pow(worldPos.y - npc.y, 2)
      );
      if (dist < 50) {
        setActiveNPC(npc);
        return;
      }
    }

    setActiveNPC(null);
  };

  useEffect(() => {
    if (!hasProfile || isBanned) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const render = (timestamp) => {
      const deltaTime = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      clearCanvas(ctx, canvasSize.width, canvasSize.height);

      // Draw base map
      drawBackground(ctx, mapImageRef.current, camera, canvasSize.width, canvasSize.height);
      
      // Add parchment texture overlay
      drawParchmentTexture(ctx, canvasSize.width, canvasSize.height);
      
      // Draw map features
      drawRoomLabels(ctx, camera, timestamp);
      drawSecretPassages(ctx, camera, timestamp, []);
      drawMovingStaircases(ctx, camera, timestamp);
      
      // Draw house zone for current user
      if (house) {
        drawHouseZone(ctx, house, camera, timestamp);
      }

      // Footprint trail
      if (Date.now() - lastTrailTimeRef.current > TRAIL_POINT_INTERVAL) {
        trailRef.current.push({
          x: selfPosition.x,
          y: selfPosition.y,
          timestamp: Date.now(),
          direction: movementDirection,
          isRunning
        });
        if (trailRef.current.length > TRAIL_MAX_LENGTH) {
          trailRef.current.shift();
        }
        lastTrailTimeRef.current = Date.now();
      }

      trailRef.current = trailRef.current.filter(
        (point) => Date.now() - point.timestamp < 3000
      );

      drawFootprintTrail(ctx, trailRef.current, camera, house);

      // Draw other users
      Object.entries(users).forEach(([uid, user]) => {
        if (uid === userId) return;

        const isBlocked = Boolean(
          blocksData?.[userId]?.[uid] || blocksData?.[uid]?.[userId]
        );
        const chatRadius = whisperMode ? WHISPER_RADIUS : CHAT_RADIUS;
        const isNearby =
          !isBlocked &&
          distance(selfPosition, user) <= chatRadius;

        // Track footprint trail for this user
        if (!otherUsersTrailsRef.current[uid]) {
          otherUsersTrailsRef.current[uid] = [];
        }
        const userTrail = otherUsersTrailsRef.current[uid];
        const lastPoint = userTrail[userTrail.length - 1];
        
        // Add new point if user moved
        if (!lastPoint || lastPoint.x !== user.x || lastPoint.y !== user.y) {
          userTrail.push({
            x: user.x,
            y: user.y,
            timestamp: Date.now(),
            direction: user.direction || 0,
            isRunning: user.isRunning || false
          });
          if (userTrail.length > TRAIL_MAX_LENGTH) {
            userTrail.shift();
          }
        }
        
        // Remove old points
        otherUsersTrailsRef.current[uid] = userTrail.filter(
          (point) => Date.now() - point.timestamp < 3000
        );
        
        // Draw trail for this user
        drawFootprintTrail(ctx, otherUsersTrailsRef.current[uid], camera, user.house);

        drawFootprint(ctx, user.x, user.y, user.name, user.house, false, camera, {
          isIdle: user.isIdle,
          isBlocked,
          isNearby,
          direction: user.direction || 0,
          isRunning: user.isRunning || false
        });

        if (chatStatuses[uid] && !isBlocked) {
          drawChattingIndicator(ctx, user.x, user.y, camera, timestamp);
        }
      });
      
      // Clean up trails for users who left
      Object.keys(otherUsersTrailsRef.current).forEach((uid) => {
        if (!users[uid]) {
          delete otherUsersTrailsRef.current[uid];
        }
      });

      // Draw scary NPCs (only when scary NPCs are active)
      // Show NPCs when: real night OR day with override
      if (scaryNPCsActive) {
        const playerScreenPos = worldToScreen(selfPosition.x, selfPosition.y, camera);
        const LIGHT_RADIUS = lumosActive ? 180 : 100;
        
        scaryNPCs.forEach((npc) => {
          const npcScreenPos = worldToScreen(npc.x, npc.y, camera);
          const distToPlayer = Math.sqrt(
            Math.pow(npcScreenPos.x - playerScreenPos.x, 2) + 
            Math.pow(npcScreenPos.y - playerScreenPos.y, 2)
          );
          
          // During darkness, only show NPCs within light radius
          const isVisible = !showDarkness || distToPlayer <= LIGHT_RADIUS * camera.zoom * 1.2;
          drawScaryNPC(ctx, npc, camera, timestamp, isVisible);
        });
      }

      // Draw self
      if (userId) {
        drawFootprint(
          ctx,
          selfPosition.x,
          selfPosition.y,
          name,
          house,
          true,
          camera,
          { 
            isIdle: users?.[userId]?.isIdle,
            direction: movementDirection,
            isRunning
          }
        );
      }
      
      // Draw spell effects
      spellEffects.forEach((effect) => {
        if (Date.now() - effect.startTime < 2000) {
          drawSpellEffect(ctx, effect.x, effect.y, camera, effect.type, timestamp);
        }
      });
      
      // Draw owl deliveries
      owlDeliveries.forEach((owl, index) => {
        const progress = (Date.now() - owl.startTime) / 2000;
        if (progress < 1) {
          drawOwlDelivery(ctx, owl.fromX, owl.fromY, owl.toX, owl.toY, camera, progress);
        }
      });
      
      // Candlelight flicker effect (on top)
      drawCandlelightEffect(ctx, canvasSize.width, canvasSize.height, timestamp);
      
      // Burnt edges
      drawBurntEdges(ctx, canvasSize.width, canvasSize.height);
      
      // Curfew darkness overlay with flashlight effect
      // Show darkness when: real night without override, OR real day with override
      if (showDarkness && userId) {
        const playerScreen = worldToScreen(selfPosition.x, selfPosition.y, camera);
        drawCurfewDarkness(ctx, canvasSize.width, canvasSize.height, playerScreen.x, playerScreen.y, lumosActive, timestamp, lumosFlash);
      }
      
      // Curfew warning - only show on desktop (mobile has it in top bar)
      if (canvasSize.width >= 640) {
        drawCurfewWarning(ctx, canvasSize.width, canvasSize.height, timestamp);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    hasProfile,
    isBanned,
    canvasSize,
    camera,
    selfPosition,
    users,
    npcs,
    userId,
    name,
    house,
    blocksData,
    chatStatuses,
    activeNPC,
    isNPCMaster,
    movementDirection,
    isRunning,
    whisperMode,
    spellEffects,
    owlDeliveries,
    lumosActive,
    lumosFlash,
    showDarkness,
    scaryNPCsActive,
    scaryNPCs
  ]);

  const isBlockedPair = useCallback(
    (otherUid) => {
      if (!otherUid || !userId) return false;
      return Boolean(
        blocksData?.[userId]?.[otherUid] || blocksData?.[otherUid]?.[userId]
      );
    },
    [blocksData, userId]
  );

  const otherUsers = useMemo(() => {
    return Object.entries(users)
      .filter(([uid, data]) => uid !== userId && !data?.banned)
      .map(([uid, data]) => ({
        uid,
        ...data,
        isBlocked: isBlockedPair(uid)
      }));
  }, [users, userId, isBlockedPair]);

  const clearActiveChat = useCallback(() => {
    // Just close the UI, don't delete from Firebase - keep history for the session
    setActiveChatId(null);
    setActiveTarget(null);
  }, []);

  useEffect(() => {
    if (!userId || !hasProfile || !activeTarget) return;

    const stillNearby = distance(selfPosition, activeTarget) <= CHAT_RADIUS;
    const blocked = isBlockedPair(activeTarget.uid);
    // Close chat panel when users move apart or get blocked (messages are preserved)
    if (!stillNearby || blocked) {
      clearActiveChat();
    }
  }, [selfPosition, activeTarget, userId, hasProfile, isBlockedPair, clearActiveChat]);

  const nearbyUsers = useMemo(() => {
    if (!userId) return [];
    const chatRadius = whisperMode ? WHISPER_RADIUS : CHAT_RADIUS;
    return otherUsers
      .map((user) => ({
        ...user,
        distance: distance(selfPosition, user)
      }))
      .filter((user) => user.distance <= chatRadius && !user.isBlocked)
      .sort((a, b) => a.distance - b.distance);
  }, [otherUsers, selfPosition, userId, whisperMode]);

  const handleSelectChatTarget = (target) => {
    if (!target || !userId || isBlockedPair(target.uid)) return;
    const chatId = [userId, target.uid].sort().join("_");
    setActiveChatId(chatId);
    setActiveTarget(target);
  };

  const handleBlockUser = async (targetUid) => {
    if (!roomId || !userId || !targetUid) return;
    await update(ref(db, `rooms/${roomId}/blocks/${userId}`), {
      [targetUid]: true
    });
    if (activeTarget?.uid === targetUid) {
      clearActiveChat();
    }
  };

  const handleReportUser = async (targetUid) => {
    if (!roomId || !userId || !targetUid) return;
    await update(ref(db, `rooms/${roomId}/reports/${targetUid}`), {
      [userId]: true
    });
  };

  const handleUnblockUser = async (targetUid) => {
    if (!roomId || !userId || !targetUid) return;
    await remove(ref(db, `rooms/${roomId}/blocks/${userId}/${targetUid}`));
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;

    const snapshot = await get(ref(db, "rooms"));
    const roomsData = snapshot.val() || {};
    const normalized = normalizeName(name);

    const activeNames = Object.values(roomsData).flatMap((room) =>
      getActiveUsers(room?.users || {})
        .map((user) => normalizeName(user?.name || ""))
        .filter(Boolean)
    );

    if (activeNames.includes(normalized)) {
      alert("This name is already claimed by another wizard!");
      return;
    }

    const assignedRoom = resolveRoomId(roomsData);
    setRoomId(assignedRoom);
    setHasProfile(true);
    
    // Check if first time user - show tutorial
    const hasSeenTutorial = localStorage.getItem('maraudersMapTutorialSeen');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }
    
    // Start feedback timer
    sessionStartRef.current = Date.now();
    startFeedbackTimer();
  };

  // Feedback timer logic
  const startFeedbackTimer = useCallback(() => {
    // Check localStorage for feedback preferences
    const feedbackNever = localStorage.getItem('maraudersMapFeedbackNever');
    const feedbackGiven = localStorage.getItem('maraudersMapFeedbackGiven');
    const feedbackLater = localStorage.getItem('maraudersMapFeedbackLater');
    
    // Don't show if user said never or already gave feedback
    if (feedbackNever === 'true' || feedbackGiven === 'true') return;
    
    // Calculate delay
    let delay = 5 * 60 * 1000; // 5 minutes default
    
    // If user clicked "ask later", use shorter delay (3 minutes from now)
    if (feedbackLater) {
      const laterTime = parseInt(feedbackLater, 10);
      const timeSinceLater = Date.now() - laterTime;
      if (timeSinceLater < 3 * 60 * 1000) {
        delay = 3 * 60 * 1000 - timeSinceLater;
      } else {
        delay = 30 * 1000; // Show soon if 3 min already passed
      }
    }
    
    // Clear existing timer
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    
    // Set timer to show feedback
    feedbackTimerRef.current = setTimeout(() => {
      setShowFeedback(true);
    }, delay);
  }, []);

  // Cleanup feedback timer on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Handle feedback submission
  const handleFeedbackSubmit = async () => {
    if (feedbackRating === 0) return;
    
    try {
      // Store feedback in Firebase
      const feedbackRef = ref(db, `feedback/${Date.now()}_${userId}`);
      await set(feedbackRef, {
        rating: feedbackRating,
        comment: feedbackText.trim() || '',
        userName: name || 'Anonymous',
        house: house || 'Unknown',
        roomId: roomId || '',
        timestamp: Date.now(),
        userAgent: navigator.userAgent || ''
      });
      
      // Mark as given
      localStorage.setItem('maraudersMapFeedbackGiven', 'true');
      setFeedbackSubmitted(true);
      
      // Close after showing thank you
      setTimeout(() => {
        setShowFeedback(false);
        setFeedbackSubmitted(false);
        setFeedbackRating(0);
        setFeedbackText('');
      }, 2000);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  // Handle "Ask Later" button
  const handleFeedbackLater = () => {
    localStorage.setItem('maraudersMapFeedbackLater', Date.now().toString());
    setShowFeedback(false);
    startFeedbackTimer(); // Restart timer for 3 more minutes
  };

  // Handle "Never Show" button  
  const handleFeedbackNever = () => {
    localStorage.setItem('maraudersMapFeedbackNever', 'true');
    setShowFeedback(false);
  };

  useEffect(() => {
    if (!roomId || !userId || !hasProfile) return;
    const roomRef = ref(db, `rooms/${roomId}/users/${userId}`);
    return () => remove(roomRef);
  }, [roomId, userId, hasProfile]);

  useEffect(() => {
    if (!isBanned || !roomId || !userId) return;
    remove(ref(db, `rooms/${roomId}/users/${userId}`));
  }, [isBanned, roomId, userId]);

  const roomLabel = roomId ? `Chamber ${getRoomNumber(roomId)}` : "";

  // Mischief Managed close handler - also cleans up chat history
  const handleMischiefManaged = async () => {
    if (roomId && userId) {
      // Clean up user's chat history before leaving
      const messagesRef = ref(db, `rooms/${roomId}/messages`);
      const snapshot = await get(messagesRef);
      const chats = snapshot.val() || {};
      
      // Delete all chats where this user is a participant
      await Promise.all(
        Object.entries(chats)
          .filter(([, chat]) => chat?.participants?.[userId])
          .map(([chatId]) => remove(ref(db, `rooms/${roomId}/messages/${chatId}`)))
      );
      
      // Remove user from room
      await remove(ref(db, `rooms/${roomId}/users/${userId}`));
    }
    
    setIsMapClosing(false);
    setHasProfile(false);
    setName("");
    setRoomId(null);
  };

  // Trigger owl delivery animation
  const triggerOwlDelivery = (fromUser, toUser) => {
    setOwlDeliveries((prev) => [
      ...prev,
      {
        fromX: fromUser.x,
        fromY: fromUser.y,
        toX: toUser.x,
        toY: toUser.y,
        startTime: Date.now()
      }
    ]);
  };

  // Trigger spell effect
  const triggerSpellEffect = (x, y, type = "lumos") => {
    setSpellEffects((prev) => [
      ...prev,
      { x, y, type, startTime: Date.now() }
    ]);
  };

  // Profile setup with magical welcome
  if (!hasProfile) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-parchment-900 via-parchment-800 to-parchment-900 flex items-center justify-center z-50 overflow-hidden">
        {/* Floating magical particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-amber-300/60 rounded-full"
              initial={{ 
                x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
                y: typeof window !== 'undefined' ? window.innerHeight + 20 : 800,
                opacity: 0 
              }}
              animate={{ 
                y: -20,
                opacity: [0, 1, 1, 0],
              }}
              transition={{ 
                duration: 4 + Math.random() * 3,
                repeat: Infinity,
                delay: Math.random() * 5,
                ease: "linear"
              }}
            />
          ))}
        </div>

        {/* Main content */}
        <motion.div
          className="relative z-10 parchment-panel rounded-2xl p-6 sm:p-8 max-w-md mx-4 text-center shadow-2xl"
          initial={{ opacity: 0, scale: 0.8, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {/* Magical glow behind */}
          <motion.div 
            className="absolute -inset-4 bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-500/20 rounded-3xl blur-xl -z-10"
            animate={{ 
              opacity: [0.5, 0.8, 0.5],
              scale: [1, 1.05, 1]
            }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          {/* Title with animation */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-2xl sm:text-3xl font-magical mb-2 text-parchment-900">
              ✨ The Marauder&apos;s Map ✨
            </h2>
            <motion.p 
              className="text-xs sm:text-sm text-parchment-600 italic mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              &quot;I solemnly swear that I am up to no good&quot;
            </motion.p>
          </motion.div>

          {/* Divider with sparkle */}
          <motion.div 
            className="flex items-center justify-center gap-3 mb-6"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-parchment-400" />
            <span className="text-amber-600">⚡</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-parchment-400" />
          </motion.div>

          {/* Form */}
          <motion.form 
            onSubmit={handleProfileSubmit} 
            className="flex flex-col gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.4 }}
          >
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-parchment-500">🧙</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your wizarding name"
                className="w-full rounded-xl border-2 border-parchment-300 bg-parchment-50 pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all"
                autoFocus
              />
            </div>
            
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-parchment-500">🏰</span>
              <select
                value={house}
                onChange={(event) => setHouse(event.target.value)}
                className="w-full rounded-xl border-2 border-parchment-300 bg-parchment-50 pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all appearance-none cursor-pointer"
              >
                {HOUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-parchment-400 pointer-events-none">▼</span>
            </div>

            <motion.button
              type="submit"
              className="relative rounded-xl bg-gradient-to-r from-parchment-700 via-parchment-600 to-parchment-700 px-6 py-3.5 text-parchment-50 font-magical text-lg overflow-hidden group"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <span>Reveal the Map</span>
                <motion.span
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  →
                </motion.span>
              </span>
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-amber-600/0 via-amber-500/30 to-amber-600/0"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </motion.button>
          </motion.form>

          {/* Footer text */}
          <motion.p 
            className="text-[10px] text-parchment-500 mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            🗺️ Explore • 💬 Chat with nearby wizards • 🏃 Run with Shift
          </motion.p>
        </motion.div>

        {/* Corner decorations */}
        <motion.div 
          className="absolute top-4 left-4 text-4xl opacity-20"
          animate={{ rotate: [0, 10, 0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          🌙
        </motion.div>
        <motion.div 
          className="absolute bottom-4 right-4 text-4xl opacity-20"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          🦉
        </motion.div>
      </div>
    );
  }

  // Banned screen
  if (isBanned) {
    return (
      <div className="fixed inset-0 bg-parchment-900 flex items-center justify-center z-50">
        <div className="parchment-panel rounded-2xl p-8 max-w-md mx-4 text-center">
          <h3 className="text-2xl font-magical mb-4">Mischief Managed</h3>
          <p className="text-sm text-parchment-700">
            You have been removed from the map by Hogwarts authority.
          </p>
        </div>
      </div>
    );
  }

  // Mischief Managed animation
  if (isMapClosing) {
    return (
      <div className="fixed inset-0 bg-parchment-900 z-50 overflow-hidden">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2, delay: 1.5 }}
          onAnimationComplete={handleMischiefManaged}
        >
          <motion.div
            className="text-center"
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 0, opacity: 0 }}
            transition={{ duration: 2.5, ease: "easeInOut" }}
          >
            <motion.p
              className="text-3xl font-magical text-parchment-300 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              &quot;Mischief Managed&quot;
            </motion.p>
            <motion.div
              className="w-64 h-1 bg-parchment-600 mx-auto"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 2, delay: 0.5 }}
            />
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // Full-screen immersive map
  return (
    <div className="fixed inset-0 bg-parchment-900 overflow-hidden touch-none">
      {/* Full-screen canvas */}
      <div
        ref={containerRef}
        className="absolute inset-0"
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* Lumos Button - DESKTOP ONLY */}
      {/* Lumos Button - Shows whenever darkness is active (real night or override) */}
      {/* Position higher (bottom-[100px]) when Exit Mode button is visible, otherwise bottom-8 */}
      {showDarkness && (
        <div className={`fixed z-30 hidden sm:flex flex-col items-center gap-1 sm:right-8 sm:w-14 ${nightOverride ? 'sm:bottom-[160px]' : 'sm:bottom-28'}`}>
          <button
            type="button"
            onClick={() => {
              const now = Date.now();
              const timeSinceLastClick = now - lastLumosClickRef.current;
              
              if (timeSinceLastClick < 400) {
                // Double-click: LUMOS MAXIMA - show full daylight map!
                setLumosFlash(true);
                setLumosActive(true);
                setTimeout(() => setLumosFlash(false), 3000); // 3 seconds of daylight
              } else {
                // Single click: Toggle Lumos
                setLumosActive(!lumosActive);
              }
              lastLumosClickRef.current = now;
            }}
            className={`rounded-full border-2 flex items-center justify-center transition-all shadow-xl
              w-14 h-14 text-2xl
              ${lumosActive 
                ? 'bg-yellow-300/90 border-yellow-400 text-yellow-900 shadow-[0_0_20px_rgba(255,255,150,0.6)]' 
                : 'bg-parchment-800/90 border-parchment-600 text-parchment-200 hover:bg-parchment-700'
              }
              ${lumosFlash ? 'animate-pulse scale-110' : ''}`}
            title={lumosActive ? "Nox (Turn off) • Double-tap for LUMOS MAXIMA!" : "Lumos (Light wand) • Double-tap for LUMOS MAXIMA!"}
          >
            {lumosFlash ? "⚡" : lumosActive ? "☀️" : "🪄"}
          </button>
          <AnimatePresence mode="wait">
            <motion.span
              key={lumosFlash ? "maxima" : lumosActive ? "lumos" : "nox"}
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              className={`text-xs font-medium ${lumosFlash ? 'text-yellow-400 font-bold drop-shadow-[0_0_8px_rgba(255,255,150,0.6)]' : lumosActive ? 'text-yellow-200' : 'text-parchment-400'}`}
            >
              {lumosFlash ? 'Maxima!' : lumosActive ? 'Nox' : 'Lumos'}
            </motion.span>
          </AnimatePresence>
        </div>
      )}
      
      

      {/* Override Night Button - DESKTOP ONLY - Shows when override is NOT active */}
      {!nightOverride && (
        <div className="fixed z-30 hidden sm:flex flex-col items-center gap-1 sm:right-8 sm:bottom-[100px]">
          <button
            type="button"
            onClick={() => setShowNightWarning(true)}
            className={`rounded-full border-2 flex items-center justify-center transition-all shadow-xl
              w-11 h-11 text-lg
              ${isRealNight 
                ? 'bg-purple-900/90 border-purple-500 text-purple-200 hover:bg-purple-800 shadow-[0_0_15px_rgba(147,51,234,0.5)]' 
                : 'bg-indigo-900/90 border-indigo-600 text-indigo-200 hover:bg-indigo-800'
              }`}
            title={isRealNight ? "Override to Daylight (DANGER: Enhanced Scary Mode!)" : "Override to Night Mode"}
          >
            {isRealNight ? "☀️" : "🌙"}
          </button>
          <span className="text-xs text-parchment-400 font-medium">
            {isRealNight ? 'Day Mode' : 'Night'}
          </span>
        </div>
      )}
      
      {/* Disable Night Override Button - DESKTOP ONLY - Shows when override is active */}
      {nightOverride && (
        <div className="fixed z-30 hidden sm:flex flex-col items-center gap-1 sm:right-8 sm:bottom-8">
          <button
            type="button"
            onClick={() => setNightOverride(false)}
            className={`rounded-full border-2 flex items-center justify-center transition-all shadow-xl
              w-14 h-14 text-2xl
              ${isEnhancedScaryMode 
                ? 'bg-red-700/90 border-red-500 text-red-100 hover:bg-red-600 animate-pulse shadow-[0_0_20px_rgba(255,0,0,0.5)]'
                : 'bg-amber-600/90 border-amber-400 text-amber-100 hover:bg-amber-500'
              }`}
            title="Disable Override - Return to normal"
          >
            ❌
          </button>
          <span className="text-xs text-parchment-400 font-medium">Exit Mode</span>
        </div>
      )}

      {/* Night Override Warning Modal */}
      <AnimatePresence>
        {showNightWarning && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="parchment-panel rounded-2xl p-4 sm:p-6 max-w-sm sm:max-w-md w-full mx-auto shadow-2xl border-4 border-indigo-800"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
            >
              {/* Warning Icon */}
              <motion.div 
                className="text-center text-5xl sm:text-6xl mb-3"
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: 2 }}
              >
                ⚠️🌙
              </motion.div>
              
              {/* Title */}
              <h3 className={`text-xl sm:text-2xl font-magical text-center mb-3 ${isRealNight ? 'text-purple-900' : 'text-indigo-900'}`}>
                {isRealNight ? "Override to Daylight" : "Override to Night Mode"}
              </h3>
              
              {/* Warning Message */}
              <div className="text-center mb-4 space-y-2">
                {isRealNight ? (
                  <>
                    <p className="text-sm sm:text-base text-parchment-800">
                      You want to light up the night? The creatures won&apos;t like that...
                    </p>
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mt-2">
                      <p className="text-red-800 font-bold text-sm sm:text-base">
                        💀 EXTREME DANGER 💀
                      </p>
                      <p className="text-red-700 text-xs sm:text-sm mt-1">
                        Overriding during real night activates <strong>ENHANCED SCARY MODE</strong>!
                      </p>
                      <ul className="text-red-600 text-xs mt-2 text-left list-disc list-inside">
                        <li>NPCs detect you from <strong>50% farther</strong> away</li>
                        <li>NPCs move <strong>1.5x faster</strong></li>
                        <li>Freeze time <strong>60% longer</strong></li>
                        <li>Cooldown between encounters <strong>halved</strong></li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm sm:text-base text-parchment-800">
                      You want to experience the darkness...
                    </p>
                    <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-3 mt-2">
                      <p className="text-amber-800 font-bold text-sm sm:text-base">
                        ⚠️ Warning ⚠️
                      </p>
                      <p className="text-amber-700 text-xs sm:text-sm mt-1">
                        Scary creatures will patrol the corridors! Use your <strong>Lumos</strong> spell wisely.
                      </p>
                      <p className="text-amber-600 text-xs mt-2 italic">
                        Snape, Filch, and Dementors are watching...
                      </p>
                    </div>
                  </>
                )}
              </div>
              
              {/* Buttons */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowNightWarning(false)}
                  className="px-4 py-2 rounded-lg bg-parchment-300 text-parchment-800 hover:bg-parchment-400 transition-colors text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setNightOverride(true);
                    setShowNightWarning(false);
                  }}
                  className={`px-4 py-2 rounded-lg transition-colors text-sm sm:text-base font-bold ${
                    isRealNight 
                      ? 'bg-red-800 text-red-100 hover:bg-red-700' 
                      : 'bg-indigo-800 text-indigo-100 hover:bg-indigo-700'
                  }`}
                >
                  {isRealNight ? "I Dare! 💀" : "Enter Night 🌙"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Scary Mode Warning Banner */}
      <AnimatePresence>
        {isEnhancedScaryMode && (
          <motion.div
            className="fixed top-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full 
              bg-red-900/90 border-2 border-red-600 shadow-lg"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <motion.p 
              className="text-red-200 text-xs sm:text-sm font-bold text-center"
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              💀 ENHANCED SCARY MODE 💀
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scared Message Toast - Shows after escaping an NPC */}
      <AnimatePresence>
        {scaredMessage && (
          <motion.div
            className="fixed bottom-52 sm:bottom-32 left-1/2 -translate-x-1/2 z-40 px-4 py-2 sm:px-6 sm:py-3 rounded-xl 
              bg-parchment-100/95 border-2 border-amber-600 shadow-xl"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
          >
            <p className="text-amber-800 text-sm sm:text-base font-magical text-center">
              {scaredMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scary NPC Encounter Modal */}
      <AnimatePresence>
        {scaryEncounter && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="parchment-panel rounded-2xl p-4 sm:p-6 max-w-sm sm:max-w-md w-full mx-auto shadow-2xl border-4"
              style={{ 
                borderColor: scaryEncounter.npc.ghostly ? '#4a6fa5' : '#8B0000'
              }}
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
            >
              {/* NPC Emoji */}
              <motion.div 
                className="text-center text-5xl sm:text-6xl mb-2 sm:mb-3"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.5, repeat: 2 }}
              >
                {scaryEncounter.npc.emoji}
              </motion.div>
              
              {/* NPC Name */}
              <h3 
                className="text-xl sm:text-2xl font-magical text-center mb-1"
                style={{ color: scaryEncounter.npc.ghostly ? '#4a6fa5' : '#8B0000' }}
              >
                {scaryEncounter.npc.name}
              </h3>
              
              {/* NPC Title */}
              {scaryEncounter.npc.title && (
                <p className="text-xs sm:text-sm text-parchment-600 text-center mb-3 sm:mb-4 italic">
                  {scaryEncounter.npc.title}
                </p>
              )}
              
              {/* Dialogue */}
              <p className="text-base sm:text-lg text-center text-parchment-800 italic mb-4 sm:mb-6 px-2">
                &quot;{scaryEncounter.dialogue}&quot;
              </p>
              
              {/* Freeze indicator */}
              {isPlayerFrozen && (
                <motion.p 
                  className="text-xs sm:text-sm text-red-700 text-center mb-3"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  ⚡ You are frozen in fear!
                </motion.p>
              )}
              
              {/* Flee Button */}
              <button
                type="button"
                onClick={() => {
                  // Show scared message when manually fleeing
                  const scaredMessages = [
                    "That was terrifying! 😱",
                    "My heart is still racing! 💓",
                    "I need to be more careful... 😰",
                    "Too close! Way too close! 😨",
                    "I thought I was done for! 😱",
                    "Phew... that was scary! 😅"
                  ];
                  setScaredMessage(scaredMessages[Math.floor(Math.random() * scaredMessages.length)]);
                  setScaryEncounter(null);
                  setTimeout(() => setScaredMessage(null), 2500);
                }}
                disabled={isPlayerFrozen}
                className={`w-full py-2.5 sm:py-3 rounded-xl font-magical text-base sm:text-lg transition-all
                  ${isPlayerFrozen 
                    ? 'bg-parchment-300 text-parchment-500 cursor-not-allowed' 
                    : 'bg-parchment-800 text-parchment-100 hover:bg-parchment-700 shadow-lg'
                  }`}
              >
                {isPlayerFrozen ? "Can't move..." : "🏃 Flee!"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top-left corner info (subtle) - hidden on mobile */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none hidden sm:block">
        <p className="text-xs text-parchment-600 opacity-60">
          {name} of {house} • {roomLabel}
        </p>
        <p className="text-[10px] text-parchment-700 opacity-40 mt-1">
          Arrow keys / WASD to move • Shift to run • Scroll to zoom • Drag to pan • Esc to close
        </p>
      </div>

      {/* MOBILE: Hidden notification listener - always mounted to receive owl notifications */}
      {/* Only render when NOT actively chatting - otherwise the active chat handles notifications */}
      {!activeTarget && (
        <div className="sm:hidden">
          <ProximityChat
            isOpen={true}
            roomId={roomId}
            chatId={null}
            self={{ uid: userId, house, name }}
            target={null}
            nearbyUsers={nearbyUsers}
            userDirectory={users}
            blockedUsers={blockedUsers}
            onSelectTarget={handleSelectChatTarget}
            onCloseChat={clearActiveChat}
            onBlockUser={handleBlockUser}
            onReportUser={handleReportUser}
            onUnblockUser={handleUnblockUser}
            compact={true}
          />
        </div>
      )}

      {/* MOBILE: Unified top bar - prevents overlap */}
      <div className="sm:hidden absolute top-0 left-0 right-0 z-10 pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-2 pt-2 pb-1">
          {/* Close button */}
          <button
            type="button"
            onClick={() => setIsMapClosing(true)}
            className="pointer-events-auto w-8 h-8 rounded-full bg-parchment-900/85 backdrop-blur-sm border border-parchment-600 flex items-center justify-center text-parchment-100 text-xs shadow-lg"
          >
            ✕
          </button>
          
          {/* Center: Name & House */}
          <div className="bg-parchment-900/85 backdrop-blur-sm rounded-full px-2.5 py-0.5 shadow-lg">
            <p className="text-[10px] text-parchment-100 font-medium truncate max-w-[120px]">
              {name} • {house}
            </p>
          </div>
          
          {/* Right: Time & Mode Status */}
          <div className={`backdrop-blur-sm rounded-full px-2 py-0.5 shadow-lg ${
            isEnhancedScaryMode ? 'bg-red-800/95' : 
            showDarkness ? 'bg-purple-900/90' : 
            scaryNPCsActive ? 'bg-amber-800/90' : 
            'bg-parchment-900/85'
          }`}>
            <p className="text-[10px] text-parchment-100 font-medium whitespace-nowrap">
              {isEnhancedScaryMode ? '💀 DANGER' : 
               showDarkness ? '🌙 Dark' : 
               scaryNPCsActive ? '⚠️ Scary' : 
               getTimeOfDay().charAt(0).toUpperCase() + getTimeOfDay().slice(1)}
            </p>
          </div>
        </div>
      </div>

      {/* Time of day indicator (top-right) - DESKTOP ONLY */}
      <div className="hidden sm:block absolute top-4 right-4 z-10 pointer-events-none">
        <div className={`backdrop-blur-sm rounded-full px-3 py-1 ${
          isEnhancedScaryMode ? 'bg-red-900/90' : 
          nightOverride ? 'bg-purple-900/80' : 
          'bg-parchment-900/80'
        }`}>
          <p className="text-xs text-parchment-100 font-medium text-right">
            {getTimeOfDay().charAt(0).toUpperCase() + getTimeOfDay().slice(1)}
            {isEnhancedScaryMode && <span className="text-red-300 ml-2 font-bold">• 💀 EXTREME</span>}
            {nightOverride && !isEnhancedScaryMode && <span className="text-purple-300 ml-2 font-bold">• Override</span>}
            {isRealNight && !nightOverride && <span className="text-amber-300 ml-2 font-bold">• Curfew</span>}
          </p>
        </div>
      </div>

      {/* Right edge - Block list panel (hidden until hover) - DESKTOP ONLY */}
      <div
        className="absolute right-0 top-1/4 z-20 group hidden sm:block"
        onMouseEnter={() => setShowBlockPanel(true)}
        onMouseLeave={() => setShowBlockPanel(false)}
      >
        {/* Tab */}
        <div className="absolute right-0 top-0 w-8 h-20 bg-parchment-200/80 rounded-l-lg flex items-center justify-center cursor-pointer border-l border-t border-b border-parchment-400">
          <span className="text-xs text-parchment-700 writing-vertical">🛡️</span>
        </div>
        
        {/* Panel */}
        <AnimatePresence>
          {showBlockPanel && (
            <motion.div
              className="absolute right-0 top-0 w-64 parchment-panel rounded-l-xl p-4 shadow-xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <h4 className="text-sm font-magical mb-3">Blocked Wizards</h4>
              {blockedUsers.length ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {blockedUsers.map((blockedUid) => {
                    const blockedUser = users?.[blockedUid];
                    return (
                      <div
                        key={blockedUid}
                        className="flex items-center justify-between rounded-lg bg-parchment-100 px-3 py-2 text-xs"
                      >
                        <span>{blockedUser?.name || "Unknown"}</span>
                        <button
                          onClick={() => handleUnblockUser(blockedUid)}
                          className="text-parchment-600 hover:text-parchment-800"
                        >
                          Unblock
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-parchment-600">No blocked wizards</p>
              )}
              
              {/* Whisper mode toggle */}
              <div className="mt-4 pt-3 border-t border-parchment-300">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whisperMode}
                    onChange={(e) => setWhisperMode(e.target.checked)}
                    className="rounded"
                  />
                  <span>Whisper mode (shorter range)</span>
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MOBILE: Floating notification when nearby wizards detected */}
      <AnimatePresence>
        {nearbyUsers.length > 0 && !showChatPanel && !activeTarget && (
          <motion.div
            className="sm:hidden fixed top-14 left-1/2 -translate-x-1/2 z-30"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
          >
            <button
              type="button"
              onClick={() => setShowChatPanel(true)}
              className="flex items-center gap-2 bg-parchment-100 border-2 border-parchment-500 rounded-full px-4 py-2 shadow-xl animate-pulse"
            >
              <span className="text-lg">🧙</span>
              <span className="text-xs font-semibold text-parchment-800">
                {nearbyUsers.length} wizard{nearbyUsers.length > 1 ? 's' : ''} nearby! Tap to chat
              </span>
              <span className="text-lg">💬</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE: Right edge tabs - Chat & Block list */}
      <div className="sm:hidden absolute right-0 top-1/4 z-20 flex flex-col gap-3">
        {/* Nearby Wizards Tab */}
        <button
          type="button"
          onClick={() => {
            setShowChatPanel(!showChatPanel);
            setShowBlockPanel(false);
          }}
          className={`w-11 h-14 backdrop-blur-sm rounded-l-xl flex flex-col items-center justify-center cursor-pointer border-l border-t border-b shadow-xl transition-all ${
            nearbyUsers.length > 0 
              ? 'bg-amber-200/95 border-amber-500 animate-pulse' 
              : 'bg-parchment-200/90 border-parchment-400'
          }`}
        >
          <span className="text-lg">💬</span>
          {nearbyUsers.length > 0 && (
            <span className="text-[10px] font-bold text-amber-900 bg-white rounded-full w-5 h-5 flex items-center justify-center shadow">
              {nearbyUsers.length}
            </span>
          )}
        </button>
        
        {/* Block List Tab */}
        <button
          type="button"
          onClick={() => {
            setShowBlockPanel(!showBlockPanel);
            setShowChatPanel(false);
          }}
          className="w-11 h-11 bg-parchment-200/90 backdrop-blur-sm rounded-l-xl flex items-center justify-center cursor-pointer border-l border-t border-b border-parchment-400 shadow-xl"
        >
          <span className="text-lg">🛡️</span>
        </button>
        
        {/* Nearby wizards panel - slides from right */}
        <AnimatePresence>
          {showChatPanel && !activeTarget && (
            <motion.div
              className="absolute right-0 top-0 w-60 parchment-panel rounded-l-xl p-3 shadow-2xl border-l-2 border-parchment-400"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-magical text-parchment-900">🧙 Nearby Wizards</h4>
                <button
                  type="button"
                  onClick={() => setShowChatPanel(false)}
                  className="w-6 h-6 rounded-full bg-parchment-200 flex items-center justify-center text-parchment-600 hover:text-parchment-800 text-sm"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar">
                {nearbyUsers.length > 0 ? (
                  nearbyUsers.map((wizard) => (
                    <button
                      key={wizard.uid}
                      type="button"
                      onClick={() => {
                        handleSelectChatTarget(wizard);
                        setShowChatPanel(false);
                      }}
                      className="w-full flex items-center justify-between rounded-lg border border-parchment-200 bg-parchment-50 px-2.5 py-2 text-left hover:bg-parchment-100 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-parchment-900 truncate">
                          {wizard.name || wizard.house}
                        </p>
                        <p className="text-[10px] text-parchment-600">
                          {Math.round(wizard.distance)}px away
                        </p>
                      </div>
                      <span className="text-parchment-500 text-base ml-2">→</span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-parchment-500 text-center py-4">
                    No wizards nearby.<br/>
                    <span className="text-[10px]">Walk closer to others to chat!</span>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Block list panel - slides from right (MOBILE) - positioned below chat panel */}
        <AnimatePresence>
          {showBlockPanel && (
            <motion.div
              className="absolute right-0 top-16 w-56 parchment-panel rounded-l-xl p-3 shadow-2xl border-l-2 border-parchment-400"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-magical text-parchment-900">🛡️ Blocked</h4>
                <button
                  type="button"
                  onClick={() => setShowBlockPanel(false)}
                  className="w-6 h-6 rounded-full bg-parchment-200 flex items-center justify-center text-parchment-600 hover:text-parchment-800 text-sm"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                {blockedUsers.length > 0 ? (
                  blockedUsers.map((blockedUid) => {
                    const blockedUser = users?.[blockedUid];
                    return (
                      <div
                        key={blockedUid}
                        className="flex items-center justify-between rounded-lg border border-parchment-200 bg-parchment-50 px-2.5 py-2"
                      >
                        <span className="text-xs text-parchment-900 truncate flex-1">
                          {blockedUser?.name || "Unknown"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUnblockUser(blockedUid)}
                          className="text-[10px] text-parchment-600 hover:text-parchment-800 ml-2"
                        >
                          Unblock
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-parchment-500 text-center py-3">
                    No blocked wizards
                  </p>
                )}
              </div>
              
              {/* Whisper mode toggle */}
              <div className="mt-3 pt-2 border-t border-parchment-300">
                <label className="flex items-center gap-2 text-[10px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whisperMode}
                    onChange={(e) => setWhisperMode(e.target.checked)}
                    className="rounded w-3 h-3"
                  />
                  <span className="text-parchment-700">Whisper mode</span>
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MOBILE: Chat panel - ONLY when actively chatting (supports maximize) */}
      <AnimatePresence>
        {activeTarget && (
          <motion.div
            className={`sm:hidden fixed z-40 ${
              isChatMaximized 
                ? 'inset-0' 
                : 'bottom-[180px] left-0 right-0 px-2'
            }`}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className={`parchment-panel shadow-xl border border-parchment-300 flex flex-col ${
              isChatMaximized 
                ? 'h-full rounded-none p-4' 
                : 'rounded-2xl p-3 max-h-[30vh]'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-parchment-200">
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold text-parchment-900 truncate ${isChatMaximized ? 'text-base' : 'text-sm'}`}>
                    💬 {activeTarget.name || activeTarget.house}
                  </h4>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {/* Maximize/Minimize button */}
                  <button
                    type="button"
                    onClick={() => setIsChatMaximized(!isChatMaximized)}
                    className="rounded-lg border border-parchment-200 bg-parchment-50 px-2 py-1 text-[10px] hover:bg-parchment-100"
                  >
                    {isChatMaximized ? '🗕' : '🗖'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBlockUser(activeTarget.uid)}
                    className="rounded-lg border border-parchment-200 bg-parchment-50 px-2 py-1 text-[10px] hover:bg-parchment-100"
                  >
                    Block
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReportUser(activeTarget.uid)}
                    className="rounded-lg border border-parchment-200 bg-parchment-50 px-2 py-1 text-[10px] hover:bg-parchment-100"
                  >
                    Report
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChatMaximized(false);
                      clearActiveChat();
                    }}
                    className="rounded-lg bg-parchment-700 px-2.5 py-1 text-[10px] text-parchment-50 hover:bg-parchment-800"
                  >
                    Close
                  </button>
                </div>
              </div>
              
              {/* Embedded chat - using ProximityChat but in compact mode */}
              <div className={isChatMaximized ? 'flex-1 overflow-hidden' : ''}>
                <ProximityChat
                  isOpen={true}
                  roomId={roomId}
                  chatId={activeChatId}
                  self={{ uid: userId, house, name }}
                  target={activeTarget}
                  nearbyUsers={[]}
                  userDirectory={users}
                  blockedUsers={blockedUsers}
                  onSelectTarget={handleSelectChatTarget}
                  onCloseChat={clearActiveChat}
                  onBlockUser={handleBlockUser}
                  onReportUser={handleReportUser}
                  onUnblockUser={handleUnblockUser}
                  compact={true}
                  maximized={isChatMaximized}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DESKTOP: Bottom - Chat panel (slides up) - supports maximize */}
      <AnimatePresence>
        {isChatMaximized && activeTarget && (
          <motion.div
            className="hidden sm:flex fixed inset-0 z-50 bg-parchment-100/98"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col w-full h-full max-w-2xl mx-auto p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-parchment-300">
                <h3 className="text-xl font-magical text-parchment-900">
                  💬 Whispers with {activeTarget.name || activeTarget.house}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsChatMaximized(false)}
                    className="rounded-lg border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-sm hover:bg-parchment-200"
                  >
                    🗕 Minimize
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBlockUser(activeTarget.uid)}
                    className="rounded-lg border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-sm hover:bg-parchment-200"
                  >
                    Block
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChatMaximized(false);
                      clearActiveChat();
                    }}
                    className="rounded-lg bg-parchment-700 px-3 py-1.5 text-sm text-parchment-50 hover:bg-parchment-800"
                  >
                    Close
                  </button>
                </div>
              </div>
              
              {/* Full screen chat */}
              <div className="flex-1 overflow-hidden">
                <ProximityChat
                  isOpen={true}
                  roomId={roomId}
                  chatId={activeChatId}
                  self={{ uid: userId, house, name }}
                  target={activeTarget}
                  nearbyUsers={[]}
                  userDirectory={users}
                  blockedUsers={blockedUsers}
                  onSelectTarget={handleSelectChatTarget}
                  onCloseChat={clearActiveChat}
                  onBlockUser={handleBlockUser}
                  onReportUser={handleReportUser}
                  onUnblockUser={handleUnblockUser}
                  maximized={true}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`hidden sm:block absolute bottom-0 left-1/2 -translate-x-1/2 z-20 ${isChatMaximized ? 'invisible' : ''}`}
        onMouseEnter={() => setShowChatPanel(true)}
        onMouseLeave={() => !activeChatId && setShowChatPanel(false)}
        onClick={() => setShowChatPanel(true)}
      >
        {/* Tab */}
        <div 
          className={`mx-auto w-32 h-6 bg-parchment-200/80 rounded-t-lg flex items-center justify-center cursor-pointer border-l border-t border-r border-parchment-400 transition-opacity ${
            (activeChatId || nearbyUsers.length > 0) ? "opacity-100" : "opacity-60"
          }`}
        >
          <span className="text-xs text-parchment-700">
            💬 {nearbyUsers.length > 0 ? `${nearbyUsers.length} nearby` : "Chat"}
          </span>
        </div>
        
        {/* Chat panel */}
        <AnimatePresence>
          {(showChatPanel || activeChatId || nearbyUsers.length > 0) && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-80 sm:w-[400px] max-w-[95vw] sm:max-w-[400px]"
            >
              {/* Maximize button for desktop when chatting */}
              {activeTarget && (
                <div className="flex justify-end mb-1">
                  <button
                    type="button"
                    onClick={() => setIsChatMaximized(true)}
                    className="rounded-lg border border-parchment-300 bg-parchment-100 px-2 py-1 text-xs hover:bg-parchment-200"
                  >
                    🗖 Maximize
                  </button>
                </div>
              )}
              <ProximityChat
                isOpen={true}
                roomId={roomId}
                chatId={activeChatId}
                self={{ uid: userId, house, name }}
                target={activeTarget}
                nearbyUsers={nearbyUsers}
                userDirectory={users}
                blockedUsers={blockedUsers}
                onSelectTarget={handleSelectChatTarget}
                onCloseChat={clearActiveChat}
                onBlockUser={handleBlockUser}
                onReportUser={handleReportUser}
                onUnblockUser={handleUnblockUser}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* NPC Dialogue Modal */}
      <AnimatePresence>
        {npcDialogue && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNpcDialogue(null)}
          >
            <motion.div
              className="parchment-panel rounded-2xl p-6 max-w-md mx-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-lg font-magical mb-1">
                {npcDialogue.npc.name}
              </h4>
              {npcDialogue.npc.title && (
                <p className="text-xs text-parchment-600 mb-3">
                  {npcDialogue.npc.title}
                </p>
              )}
              <p className="text-sm italic text-parchment-800 mb-4">
                &quot;{npcDialogue.text}&quot;
              </p>
              <button
                type="button"
                onClick={() => setNpcDialogue(null)}
                className="w-full rounded-xl bg-parchment-700 px-4 py-2 text-sm text-parchment-50"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* First-Time User Tutorial Guide */}
      <AnimatePresence>
        {showTutorial && (
          <>
            {/* Overlay - lighter for button steps so user can see them */}
            <motion.div
              className={`fixed inset-0 z-[90] ${
                [1, 2, 4, 5].includes(tutorialStep) ? 'bg-black/60' : 'bg-black/80'
              }`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            
            {/* Button-specific tutorial tooltips (positioned above controls) - MOBILE ONLY */}
            {[1, 2, 4, 5].includes(tutorialStep) && (
              <motion.div
                className="fixed bottom-48 left-0 right-0 z-[100] px-6 flex justify-center sm:hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
              >
                <div className="parchment-panel rounded-2xl p-4 shadow-2xl border-2 border-orange-400/50 relative w-full max-w-[280px]">
                  {/* Arrow pointing down to controls */}
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[12px] border-r-[12px] border-t-[12px] border-transparent border-t-parchment-200" />
                  
                  {tutorialStep === 1 && (
                    <div className="text-center">
                      <div className="text-3xl mb-2">🕹️</div>
                      <h3 className="text-lg font-magical text-parchment-900 mb-2">Movement</h3>
                      <p className="text-sm text-parchment-700">
                        Use the <strong>joystick</strong> below to move around the castle!
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 2 && (
                    <div className="text-center">
                      <div className="text-3xl mb-2">🏃</div>
                      <h3 className="text-lg font-magical text-parchment-900 mb-2">Running</h3>
                      <p className="text-sm text-parchment-700">
                        Tap the <strong>Run button</strong> to move faster!
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 4 && (
                    <div className="text-center">
                      <div className="text-3xl mb-2">🪄</div>
                      <h3 className="text-lg font-magical text-parchment-900 mb-2">Lumos Spell</h3>
                      <p className="text-sm text-parchment-700">
                        At night, tap <strong>Lumos</strong> to light your wand! Double-tap for <em>Lumos Maxima!</em>
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 5 && (
                    <div className="text-center">
                      <div className="text-3xl mb-2">🌙</div>
                      <h3 className="text-lg font-magical text-parchment-900 mb-2">Night Mode</h3>
                      <p className="text-sm text-parchment-700">
                        Toggle <strong>night/day</strong> mode. Beware - scary creatures roam at night! 👻
                      </p>
                    </div>
                  )}
                  
                  {/* Navigation buttons */}
                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-parchment-300">
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem('maraudersMapTutorialSeen', 'true');
                        setShowTutorial(false);
                        setTutorialStep(0);
                      }}
                      className="px-3 py-1.5 text-xs text-parchment-600 hover:text-parchment-800"
                    >
                      Skip
                    </button>
                    
                    <div className="flex items-center gap-2">
                      {/* Progress dots */}
                      <div className="flex gap-1 mr-2">
                        {[0, 1, 2, 3, 4, 5, 6].map((step) => (
                          <div
                            key={step}
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${
                              step === tutorialStep ? 'bg-orange-500' : 'bg-parchment-300'
                            }`}
                          />
                        ))}
                      </div>
                      
                      {tutorialStep > 0 && (
                        <button
                          type="button"
                          onClick={() => setTutorialStep(tutorialStep - 1)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-parchment-300 bg-parchment-50 hover:bg-parchment-100"
                        >
                          Back
                        </button>
                      )}
                      
                      <button
                        type="button"
                        onClick={() => setTutorialStep(tutorialStep + 1)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-orange-500 text-white hover:bg-orange-600"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Regular centered modal - DESKTOP (always) or MOBILE (for steps 0, 3, 6 only) */}
            <motion.div
              className={`fixed inset-0 z-[100] flex items-center justify-center px-4 ${
                [1, 2, 4, 5].includes(tutorialStep) ? 'hidden sm:flex' : ''
              }`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
                <motion.div
                  className="parchment-panel rounded-2xl p-5 sm:p-6 max-w-md w-full mx-auto shadow-2xl border-2 border-parchment-400"
                  initial={{ scale: 0.8, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.8, y: 20 }}
                >
                  {/* Tutorial Steps */}
                  {tutorialStep === 0 && (
                    <div className="text-center">
                      <div className="text-5xl mb-4">🗺️✨</div>
                      <h3 className="text-xl font-magical text-parchment-900 mb-3">Welcome to the Marauder&apos;s Map!</h3>
                      <p className="text-sm text-parchment-700 mb-4">
                        This enchanted map shows the location of every witch and wizard nearby. 
                        Let&apos;s learn how to use it!
                      </p>
                    </div>
                  )}
                  
                  {/* Desktop-only versions of button steps */}
                  {tutorialStep === 1 && (
                    <div className="text-center">
                      <div className="text-5xl mb-4">🕹️</div>
                      <h3 className="text-xl font-magical text-parchment-900 mb-3">Movement</h3>
                      <p className="text-sm text-parchment-700 mb-2">
                        <strong>Desktop:</strong> Use Arrow Keys or WASD to move
                      </p>
                      <p className="text-sm text-parchment-700 mb-4">
                        <strong>Mobile:</strong> Use the joystick at the bottom of the screen
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 2 && (
                    <div className="text-center">
                      <div className="text-5xl mb-4">🏃</div>
                      <h3 className="text-xl font-magical text-parchment-900 mb-3">Running</h3>
                      <p className="text-sm text-parchment-700 mb-2">
                        <strong>Desktop:</strong> Hold Shift while moving to run faster
                      </p>
                      <p className="text-sm text-parchment-700 mb-4">
                        <strong>Mobile:</strong> Tap the Run button to toggle running
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 3 && (
                    <div className="text-center">
                      <div className="text-5xl mb-4">💬</div>
                      <h3 className="text-xl font-magical text-parchment-900 mb-3">Chat with Wizards</h3>
                      <p className="text-sm text-parchment-700 mb-4">
                        When you&apos;re near another wizard, you can send them messages! 
                        Look for the chat panel at the bottom (desktop) or the 💬 button (mobile).
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 4 && (
                    <div className="text-center">
                      <div className="text-5xl mb-4">🪄</div>
                      <h3 className="text-xl font-magical text-parchment-900 mb-3">Lumos Spell</h3>
                      <p className="text-sm text-parchment-700 mb-2">
                        At night (9PM-6AM), the map gets dark! Use the <strong>Lumos</strong> button to light your wand.
                      </p>
                      <p className="text-sm text-parchment-700 mb-4">
                        <strong>Pro tip:</strong> Double-tap for <em>Lumos Maxima</em> - a powerful burst of light!
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 5 && (
                    <div className="text-center">
                      <div className="text-5xl mb-4">🌙</div>
                      <h3 className="text-xl font-magical text-parchment-900 mb-3">Night Mode</h3>
                      <p className="text-sm text-parchment-700 mb-4">
                        You can toggle night/day mode manually with the moon/sun button. 
                        But beware - scary creatures roam at night! 👻
                      </p>
                    </div>
                  )}
                  
                  {tutorialStep === 6 && (
                    <div className="text-center">
                      <div className="text-5xl mb-4">🎉</div>
                      <h3 className="text-xl font-magical text-parchment-900 mb-3">You&apos;re Ready!</h3>
                      <p className="text-sm text-parchment-700 mb-4">
                        That&apos;s all you need to know! Explore the castle, meet other wizards, 
                        and remember - &quot;Mischief Managed&quot; (press Escape to close the map)!
                      </p>
                    </div>
                  )}

                  {/* Progress dots */}
                  <div className="flex justify-center gap-2 mb-4">
                    {[0, 1, 2, 3, 4, 5, 6].map((step) => (
                      <div
                        key={step}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          step === tutorialStep ? 'bg-parchment-700' : 'bg-parchment-300'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Navigation buttons */}
                  <div className="flex justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem('maraudersMapTutorialSeen', 'true');
                        setShowTutorial(false);
                        setTutorialStep(0);
                      }}
                      className="px-4 py-2 text-sm text-parchment-600 hover:text-parchment-800"
                    >
                      Skip
                    </button>
                    
                    <div className="flex gap-2">
                      {tutorialStep > 0 && (
                        <button
                          type="button"
                          onClick={() => setTutorialStep(tutorialStep - 1)}
                          className="px-4 py-2 text-sm rounded-lg border border-parchment-300 bg-parchment-50 hover:bg-parchment-100"
                        >
                          Back
                        </button>
                      )}
                      
                      {tutorialStep < 6 ? (
                        <button
                          type="button"
                          onClick={() => setTutorialStep(tutorialStep + 1)}
                          className="px-4 py-2 text-sm rounded-lg bg-parchment-700 text-parchment-50 hover:bg-parchment-800"
                        >
                          Next
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.setItem('maraudersMapTutorialSeen', 'true');
                            setShowTutorial(false);
                            setTutorialStep(0);
                          }}
                          className="px-4 py-2 text-sm rounded-lg bg-parchment-700 text-parchment-50 hover:bg-parchment-800"
                        >
                          Start Exploring! 🗺️
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {showFeedback && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && handleFeedbackLater()}
          >
            <motion.div
              className="parchment-panel rounded-2xl p-5 sm:p-6 max-w-sm w-full mx-auto shadow-2xl border-2 border-parchment-400"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              {feedbackSubmitted ? (
                /* Thank you message */
                <motion.div 
                  className="text-center py-4"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                >
                  <div className="text-5xl mb-4">✨🦉✨</div>
                  <h3 className="text-xl font-magical text-parchment-900 mb-2">Thank You!</h3>
                  <p className="text-sm text-parchment-700">
                    Your feedback has been sent by owl post! 📬
                  </p>
                </motion.div>
              ) : (
                /* Feedback form */
                <>
                  <div className="text-center mb-4">
                    <div className="text-4xl mb-2">📝🦉</div>
                    <h3 className="text-lg font-magical text-parchment-900 mb-1">How&apos;s Your Adventure?</h3>
                    <p className="text-xs text-parchment-600">
                      We&apos;d love to hear your thoughts on the Marauder&apos;s Map!
                    </p>
                  </div>

                  {/* Star Rating */}
                  <div className="flex justify-center gap-3 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackRating(star)}
                        className={`text-3xl p-2 transition-transform hover:scale-110 active:scale-95 ${
                          star <= feedbackRating ? 'drop-shadow-[0_0_8px_rgba(255,200,0,0.8)]' : 'opacity-40'
                        }`}
                      >
                        {star <= feedbackRating ? '⭐' : '☆'}
                      </button>
                    ))}
                  </div>

                  {/* Rating label */}
                  <p className="text-center text-xs text-parchment-600 mb-3">
                    {feedbackRating === 0 && 'Tap a star to rate'}
                    {feedbackRating === 1 && 'Needs Improvement'}
                    {feedbackRating === 2 && 'Could Be Better'}
                    {feedbackRating === 3 && 'It&apos;s Good'}
                    {feedbackRating === 4 && 'Really Enjoying It!'}
                    {feedbackRating === 5 && 'Absolutely Magical! ✨'}
                  </p>

                  {/* Optional text feedback */}
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Any suggestions or comments? (optional)"
                    className="w-full p-3 rounded-lg bg-parchment-100/80 border border-parchment-300 text-sm text-parchment-800 placeholder-parchment-500 resize-none focus:outline-none focus:ring-2 focus:ring-parchment-500"
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-right text-[10px] text-parchment-500 mt-1 mb-3">
                    {feedbackText.length}/500
                  </p>

                  {/* Submit button */}
                  <button
                    type="button"
                    onClick={handleFeedbackSubmit}
                    disabled={feedbackRating === 0}
                    className={`w-full py-3 rounded-lg text-sm font-medium transition-all mb-3 active:scale-[0.98] ${
                      feedbackRating > 0
                        ? 'bg-parchment-700 text-parchment-50 hover:bg-parchment-800 active:bg-parchment-900'
                        : 'bg-parchment-300 text-parchment-500 cursor-not-allowed'
                    }`}
                  >
                    Send Feedback 🦉
                  </button>

                  {/* Ask Later & Never Show buttons */}
                  <div className="flex justify-between items-center pt-3 border-t border-parchment-300">
                    <button
                      type="button"
                      onClick={handleFeedbackNever}
                      className="text-sm py-2 px-3 text-parchment-500 hover:text-parchment-700 active:text-parchment-900"
                    >
                      Never Show
                    </button>
                    <button
                      type="button"
                      onClick={handleFeedbackLater}
                      className="text-sm py-2 px-3 text-parchment-600 hover:text-parchment-800 active:text-parchment-900 font-medium"
                    >
                      Ask Me Later ⏰
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Virtual Joystick with All Controls */}
      <VirtualJoystick 
        onMove={handleJoystickMove}
        onRunToggle={setIsRunning}
        isRunning={isRunning}
        showLumos={showDarkness}
        lumosActive={lumosActive}
        lumosFlash={lumosFlash}
        onLumosClick={() => {
          const now = Date.now();
          const timeSinceLastClick = now - lastLumosClickRef.current;
          
          if (timeSinceLastClick < 400) {
            setLumosFlash(true);
            setLumosActive(true);
            setTimeout(() => setLumosFlash(false), 3000);
          } else {
            setLumosActive(!lumosActive);
          }
          lastLumosClickRef.current = now;
        }}
        nightOverride={nightOverride}
        isRealNight={isRealNight}
        isEnhancedScaryMode={isEnhancedScaryMode}
        onOverrideClick={() => setShowNightWarning(true)}
        onDisableOverride={() => setNightOverride(false)}
        highlightButton={
          showTutorial
            ? tutorialStep === 1 ? 'joystick'
            : tutorialStep === 2 ? 'run'
            : tutorialStep === 4 ? 'lumos'
            : tutorialStep === 5 ? 'night'
            : null
            : null
        }
      />
    </div>
  );
}
