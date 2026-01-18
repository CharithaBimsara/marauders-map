"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Spell configuration (same as MapContainer)
const SPELL_CONFIG = {
  obscuro: { cooldown: 45000, duration: 10000, range: 200, name: "Obscuro", icon: "🌑", color: "#4B0082" },
  expelliarmus: { cooldown: 60000, range: 200, name: "Expelliarmus", icon: "⚡", color: "#FF4500" },
  invisibility: { cooldown: 60000, duration: 15000, name: "Invisibility Cloak", icon: "👻", color: "#87CEEB" },
  polyjuice: { cooldown: 120000, duration: 30000, name: "Polyjuice Potion", icon: "🧪", color: "#32CD32" }
};

export default function VirtualJoystick({ 
  onMove, 
  onRunToggle, 
  isRunning,
  showLumos,
  lumosActive,
  lumosFlash,
  onLumosClick,
  nightOverride,
  isRealNight,
  isEnhancedScaryMode,
  onOverrideClick,
  onDisableOverride,
  highlightButton, // 'run', 'joystick', 'lumos', 'night'
  // Spell system props
  onCastSpell,
  spellCooldowns = {},
  activeSpells = {}
}) {
  const joystickRef = useRef(null);
  const knobRef = useRef(null);
  const animationRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const [knobPosition, setKnobPosition] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSpellMenu, setShowMobileSpellMenu] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        'ontouchstart' in window || 
        navigator.maxTouchPoints > 0 ||
        window.innerWidth < 640
      );
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getJoystickCenter = useCallback(() => {
    if (!joystickRef.current) return { x: 0, y: 0 };
    const rect = joystickRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }, []);

  const handleMove = useCallback((clientX, clientY) => {
    const center = getJoystickCenter();
    const maxRadius = 40; // Max distance knob can move

    let dx = clientX - center.x;
    let dy = clientY - center.y;
    
    // Clamp to max radius
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > maxRadius) {
      dx = (dx / distance) * maxRadius;
      dy = (dy / distance) * maxRadius;
    }

    setKnobPosition({ x: dx, y: dy });

    // Normalize for movement (-1 to 1)
    const normalizedX = dx / maxRadius;
    const normalizedY = dy / maxRadius;
    
    onMove?.(normalizedX, normalizedY);
  }, [getJoystickCenter, onMove]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsActive(true);
    
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);

    // Start continuous movement loop
    const moveLoop = () => {
      if (knobPosition.x !== 0 || knobPosition.y !== 0) {
        onMove?.(knobPosition.x / 40, knobPosition.y / 40);
      }
      animationRef.current = requestAnimationFrame(moveLoop);
    };
    animationRef.current = requestAnimationFrame(moveLoop);
  }, [handleMove, knobPosition, onMove]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isActive) return;
    
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  }, [isActive, handleMove]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsActive(false);
    setKnobPosition({ x: 0, y: 0 });
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  // Continuous movement while joystick is held
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      if (knobPosition.x !== 0 || knobPosition.y !== 0) {
        onMove?.(knobPosition.x / 40, knobPosition.y / 40);
      }
    }, 50); // Move every 50ms while held

    return () => clearInterval(interval);
  }, [isActive, knobPosition, onMove]);

  if (!isMobile) return null;

  // Highlight ring component for tutorial
  const HighlightRing = ({ show, size = 'w-14 h-14' }) => (
    show && (
      <div className={`absolute inset-0 -m-1.5 ${size} rounded-full pointer-events-none z-50`}>
        <div className="absolute inset-0 rounded-full border-[3px] border-orange-500 animate-ping opacity-75" />
        <div className="absolute inset-0 rounded-full border-[3px] border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.8)]" />
      </div>
    )
  );

  return (
    <>
    {/* Mobile Spell Menu (above joystick) - 2x2 grid for better fit */}
    <AnimatePresence>
      {showMobileSpellMenu && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-44 left-1/2 -translate-x-1/2 z-40"
        >
          <div className="grid grid-cols-2 gap-2 bg-black/80 backdrop-blur-sm rounded-2xl p-3">
            {Object.entries(SPELL_CONFIG).map(([spellKey, spell]) => {
              const isOnCooldown = (spellCooldowns[spellKey] || 0) > Date.now();
              const cooldownRemaining = isOnCooldown 
                ? Math.ceil(((spellCooldowns[spellKey] || 0) - Date.now()) / 1000) 
                : 0;
              
              return (
                <button
                  key={spellKey}
                  onClick={() => {
                    onCastSpell?.(spellKey);
                    setShowMobileSpellMenu(false);
                  }}
                  disabled={isOnCooldown}
                  className={`w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center transition-all
                    ${isOnCooldown 
                      ? 'bg-gray-600/80 border-gray-500 text-gray-400' 
                      : 'bg-parchment-800/90 border-parchment-500 text-white active:scale-95'
                    }`}
                  style={{ 
                    boxShadow: isOnCooldown ? 'none' : `0 0 10px ${spell.color}40`
                  }}
                >
                  <span className="text-xl">{spell.icon}</span>
                  <span className="text-[9px] font-medium mt-0.5">
                    {isOnCooldown ? `${cooldownRemaining}s` : spell.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
      {/* Horizontal row: Run -> Joystick -> Night -> Spells */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Run button - Left */}
        <div className="flex flex-col items-center gap-0.5 relative">
          <HighlightRing show={highlightButton === 'run'} />
          <button
            type="button"
            onClick={() => onRunToggle?.(!isRunning)}
            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center text-base sm:text-lg transition-colors shadow-xl ${
              isRunning
                ? 'bg-parchment-600/90 border-parchment-700 text-parchment-100'
                : 'bg-parchment-200/80 border-parchment-500/80 text-parchment-700'
            } backdrop-blur-sm`}
          >
            🏃
          </button>
          <span className="text-[10px] sm:text-sm text-white font-semibold">{isRunning ? 'Run!' : 'Run'}</span>
        </div>

        {/* Joystick - Center */}
        <div className="flex flex-col items-center gap-0.5 relative">
          {highlightButton === 'joystick' && (
            <div className="absolute -inset-2 rounded-full pointer-events-none z-50">
              <div className="absolute inset-0 rounded-full border-[3px] border-orange-500 animate-ping opacity-75" />
              <div className="absolute inset-0 rounded-full border-[3px] border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.8)]" />
            </div>
          )}
          <div
            ref={joystickRef}
            className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-parchment-200/80 border-2 border-parchment-500/80 backdrop-blur-sm shadow-xl"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Direction indicators */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="absolute top-1 sm:top-2 text-parchment-600/50 text-xs sm:text-sm">▲</div>
              <div className="absolute bottom-1 sm:bottom-2 text-parchment-600/50 text-xs sm:text-sm">▼</div>
              <div className="absolute left-1 sm:left-2 text-parchment-600/50 text-xs sm:text-sm">◀</div>
              <div className="absolute right-1 sm:right-2 text-parchment-600/50 text-xs sm:text-sm">▶</div>
            </div>
            
            {/* Knob */}
            <div
              ref={knobRef}
              className={`absolute top-1/2 left-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-colors ${
                isActive 
                  ? 'bg-parchment-600/90 border-parchment-700' 
                  : 'bg-parchment-400/80 border-parchment-500'
              } border-2 shadow-xl`}
              style={{
                transform: `translate(calc(-50% + ${knobPosition.x}px), calc(-50% + ${knobPosition.y}px))`
              }}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-br from-parchment-300/50 to-transparent" />
            </div>
          </div>
          <span className="text-[10px] sm:text-sm text-white font-semibold">Move</span>
        </div>

        {/* Lumos Button - After joystick */}
        {showLumos && (
          <div className="flex flex-col items-center gap-0.5 relative">
            <HighlightRing show={highlightButton === 'lumos'} />
            <button
              type="button"
              onClick={onLumosClick}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center text-base sm:text-lg transition-all shadow-xl backdrop-blur-sm
                ${lumosActive 
                  ? 'bg-yellow-300/90 border-yellow-400 text-yellow-900 shadow-[0_0_15px_rgba(255,255,150,0.6)]' 
                  : 'bg-parchment-800/90 border-parchment-600 text-parchment-200'
                }
                ${lumosFlash ? 'animate-pulse scale-110' : ''}`}
            >
              {lumosFlash ? "⚡" : lumosActive ? "☀️" : "🪄"}
            </button>
            <span className="text-[10px] sm:text-sm text-white font-semibold">
              {lumosFlash ? 'Max!' : lumosActive ? 'Nox' : 'Lumos'}
            </span>
          </div>
        )}

        {/* Override Night Button - Right side */}
        {!nightOverride && (
          <div className="flex flex-col items-center gap-0.5 relative">
            <HighlightRing show={highlightButton === 'night'} />
            <button
              type="button"
              onClick={onOverrideClick}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center text-base sm:text-lg transition-all shadow-xl backdrop-blur-sm
                ${isRealNight 
                  ? 'bg-purple-900/90 border-purple-500 text-purple-200 shadow-[0_0_12px_rgba(147,51,234,0.5)]' 
                  : 'bg-indigo-900/90 border-indigo-600 text-indigo-200'
                }`}
            >
              {isRealNight ? "☀️" : "🌙"}
            </button>
            <span className="text-[10px] sm:text-sm text-white font-semibold">
              {isRealNight ? 'Day' : 'Night'}
            </span>
          </div>
        )}

        {/* Disable Override Button - Right side (when override active) */}
        {nightOverride && (
          <div className="flex flex-col items-center gap-0.5 relative">
            <button
              type="button"
              onClick={onDisableOverride}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center text-base sm:text-lg transition-all shadow-xl backdrop-blur-sm
                ${isEnhancedScaryMode 
                  ? 'bg-red-700/90 border-red-500 text-red-100 animate-pulse shadow-[0_0_15px_rgba(255,0,0,0.5)]'
                  : 'bg-amber-600/90 border-amber-400 text-amber-100'
                }`}
            >
              ❌
            </button>
            <span className="text-[10px] sm:text-sm text-white font-semibold">Exit</span>
          </div>
        )}

        {/* Wand/Spell Button - Far right */}
        <div className="flex flex-col items-center gap-0.5 relative">
          <button
            type="button"
            onClick={() => setShowMobileSpellMenu(!showMobileSpellMenu)}
            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center text-base sm:text-lg transition-all shadow-xl backdrop-blur-sm
              ${showMobileSpellMenu 
                ? 'bg-amber-500/90 border-amber-400 text-amber-900 scale-110' 
                : 'bg-parchment-700/90 border-parchment-500 text-parchment-100'
              }
              ${activeSpells?.invisibility ? 'opacity-50' : ''}`}
          >
            🪄
          </button>
          <span className="text-[10px] sm:text-sm text-white font-semibold">Spells</span>
        </div>
      </div>
    </div>
    </>
  );
}
