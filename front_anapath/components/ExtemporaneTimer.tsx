'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '@/lib/api';

interface ExtemporaneTimerProps {
  startTime: Date | string;
  requestId?: string;
  anapathId?: string;
  patientId?: string;
  onTimeOut?: () => void;
}

export default function ExtemporaneTimer({ 
  startTime, 
  requestId, 
  anapathId, 
  patientId, 
  onTimeOut 
}: ExtemporaneTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);
  const [alertSent, setAlertSent] = useState(false);

  // Fonction pour jouer un son (bip) via Web Audio API
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn('Impossible de jouer le son :', e);
    }
  };

  // Fonction pour envoyer la notification au backend (pour qu'elle apparaisse dans la cloche)
  const sendNotification = async () => {
    try {
      await axios.post(`${API_BASE}/anapath/notifications/stat-alert`, {
        anapathId,
        patientId,
        requestId,
      });
      console.log('✅ Notification STAT envoyée avec succès');
      
      // Déclencher un événement personnalisé pour forcer le rafraîchissement de la cloche
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('stat-alert'));
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi de la notification STAT:', error);
    }
  };

  useEffect(() => {
    const start = new Date(startTime);
    const deadline = new Date(start.getTime() + 30 * 60 * 1000);

    const updateTimer = () => {
      const now = new Date();
      const remaining = deadline.getTime() - now.getTime();
      
      if (remaining <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
        if (onTimeOut) onTimeOut();
        return;
      }
      
      const seconds = Math.floor(remaining / 1000);
      setTimeLeft(seconds);

      // Alerte à 5 minutes (300 secondes) – déclenchée une seule fois
      if (seconds <= 300 && seconds > 0 && !alertSent) {
        setAlertSent(true);
        playBeep(); // Jouer le son
        sendNotification(); // Envoyer la notification au backend pour la cloche
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime, onTimeOut, alertSent, anapathId, patientId, requestId]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getColor = () => {
    if (isExpired) return 'bg-red-800 text-white';
    if (timeLeft < 600) return 'bg-orange-500 text-white';
    return 'bg-primary text-white';
  };

  if (timeLeft === 0 && isExpired) {
    return (
      <div className="bg-red-800 text-white p-4 rounded-lg text-center">
        <span className="material-symbols-outlined text-3xl">timer_off</span>
        <p className="font-bold mt-1">TEMPS ÉCOULÉ</p>
        <p className="text-xs">Le délai de 30 minutes est dépassé</p>
      </div>
    );
  }

  return (
    <div className={`${getColor()} p-4 rounded-lg text-center transition-all duration-300 shadow-lg`}>
      <div className="flex items-center justify-center gap-2">
        <span className="material-symbols-outlined text-2xl">timer</span>
        <span className="font-mono text-3xl font-bold tracking-wider">
          {formatTime(timeLeft)}
        </span>
      </div>
      <p className="text-sm mt-1 font-medium">Temps restant pour examen STAT</p>
    </div>
  );
}