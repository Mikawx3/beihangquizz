'use client';

import { useEffect, useState, useRef } from 'react';

interface Option {
  text: string;
  image?: string;
}

interface RevealAnimationProps {
  question: string;
  winnerName: string;
  winnerImage?: string;
  winnerImage2?: string; // Pour les couples (pairing)
  allOptions?: (string | Option)[]; // Toutes les options avec leurs images (déprécié, utiliser winnerImage)
  onComplete: () => void;
}

// Liste des fichiers MP3 disponibles dans /sounds/
const AVAILABLE_SOUNDS = [
  '/sounds/drum-roll.mp3',
  '/sounds/paul.mp3',
  '/sounds/Dayun Jindu.mp3',
  '/sounds/Dayun Jindu 2.mp3',
  '/sounds/Dayun Jindu 3.mp3',
  '/sounds/Dayun Jindu 4.mp3',
  '/sounds/Kouweitang (Dayun Jindu Shop).mp3',
];

// Contexte audio global pour iOS - sera activé lors de la première interaction utilisateur
let audioContextActivated = false;
let audioContextUnlockPromise: Promise<void> | null = null;

// Fonction pour activer le contexte audio (nécessaire pour iOS)
const unlockAudioContext = async (): Promise<void> => {
  if (audioContextActivated) {
    return Promise.resolve();
  }

  if (audioContextUnlockPromise) {
    return audioContextUnlockPromise;
  }

  audioContextUnlockPromise = (async () => {
    try {
      // Créer un audio silencieux pour débloquer le contexte audio
      const silentAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE=');
      silentAudio.volume = 0.01;
      silentAudio.preload = 'auto';
      
      try {
        await silentAudio.play();
        await silentAudio.pause();
        silentAudio.currentTime = 0;
        audioContextActivated = true;
        console.log('✅ Contexte audio activé pour iOS');
      } catch (e) {
        console.warn('⚠️ Impossible d\'activer le contexte audio:', e);
      }
    } catch (e) {
      console.warn('⚠️ Erreur lors de l\'activation du contexte audio:', e);
    }
  })();

  return audioContextUnlockPromise;
};

// Fonction pour choisir aléatoirement un son parmi ceux disponibles
// Utilise Math.random() pour une vraie randomisation à chaque appel
const getRandomSound = (): string => {
  const randomIndex = Math.floor(Math.random() * AVAILABLE_SOUNDS.length);
  const selectedSound = AVAILABLE_SOUNDS[randomIndex];
  console.log(`🎲 Sélection aléatoire: index ${randomIndex} -> ${selectedSound}`);
  return selectedSound;
};

// Fonction helper pour normaliser les chemins d'images (pour Vercel)
const normalizeImagePath = (imagePath: string | undefined): string | undefined => {
  if (!imagePath) {
    return undefined;
  }
  
  // Si c'est déjà une URL complète (http/https), la retourner telle quelle
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Si le chemin commence par /, le retourner tel quel (chemin absolu)
  if (imagePath.startsWith('/')) {
    return imagePath;
  }
  
  // Sinon, ajouter / au début pour en faire un chemin absolu depuis la racine
  return `/${imagePath}`;
};

// Fonction helper pour obtenir l'image d'une option
const getOptionImage = (option: string | Option): string | undefined => {
  if (typeof option === 'string') {
    return undefined;
  }
  return normalizeImagePath(option.image);
};

export default function RevealAnimation({
  question,
  winnerName,
  winnerImage,
  winnerImage2,
  allOptions = [],
  onComplete,
}: RevealAnimationProps) {
  const [revealProgress, setRevealProgress] = useState(0);
  const [spotlightPosition, setSpotlightPosition] = useState({ x: 0, y: 0 });
  const [imageOpacity, setImageOpacity] = useState(0);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [showFullResult, setShowFullResult] = useState(false);
  const [randomLetters, setRandomLetters] = useState<string>('');
  const [floatingImages, setFloatingImages] = useState<Array<{
    id: number;
    image: string;
    position: { x: number; y: number };
    size: number;
    lastMove: number;
  }>>([]);
  const floatingImagesRef = useRef<Array<{
    id: number;
    image: string;
    position: { x: number; y: number };
    size: number;
    lastMove: number;
  }>>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastLetterUpdateRef = useRef<number>(0);
  const lastImageMoveRef = useRef<number>(0);
  const soundTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const finalDisplayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioEventListenerRef = useRef<((this: HTMLAudioElement, ev: Event) => void) | null>(null);

  useEffect(() => {
    // Nettoyer immédiatement toute animation/son précédent
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioRef.current) {
      // Nettoyer l'event listener si présent
      if (audioEventListenerRef.current) {
        audioRef.current.removeEventListener('canplaythrough', audioEventListenerRef.current);
        audioEventListenerRef.current = null;
      }
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (soundTimeoutRef.current) {
      clearTimeout(soundTimeoutRef.current);
      soundTimeoutRef.current = null;
    }
    if (finalDisplayTimeoutRef.current) {
      clearTimeout(finalDisplayTimeoutRef.current);
      finalDisplayTimeoutRef.current = null;
    }
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    // Réinitialiser les états
    setRevealProgress(0);
    setImageOpacity(0);
    setShowFullResult(false);
    setRandomLetters('');

    // Choisir aléatoirement un son parmi ceux disponibles
    const randomSound = getRandomSound();
    const audio = new Audio(randomSound);
    audio.volume = 0.7;
    audio.loop = false; // Ne pas boucler, jouer une seule fois
    audioRef.current = audio;
    
    // Essayer de charger et jouer le son
    const playAudio = async () => {
      try {
        // Débloquer le contexte audio pour iOS avant de jouer
        await unlockAudioContext();
        
        // Réessayer de jouer après le déblocage
        if (audioRef.current === audio) {
          await audio.play();
          console.log(`Son aléatoire joué: ${randomSound}`);
          
          // Arrêter le son après 2 secondes
          soundTimeoutRef.current = setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
            }
          }, 2000);
        }
      } catch (err) {
        console.warn('Fichier audio non trouvé ou erreur de lecture:', err);
        console.log(`Impossible de jouer le son: ${randomSound}`);
        // Le son ne jouera pas mais l'animation continuera
      }
    };
    
    // Stocker la référence à la fonction pour pouvoir la nettoyer
    audioEventListenerRef.current = playAudio;
    
    // Attendre que l'audio soit chargé avant de jouer
    audio.addEventListener('canplaythrough', playAudio);
    audio.load();
    
    // Fallback si l'événement ne se déclenche pas
    fallbackTimeoutRef.current = setTimeout(async () => {
      if (audio.readyState >= 2 && audioRef.current === audio) {
        await playAudio();
      }
    }, 100);

    // Animation du projecteur (durées divisées par 4)
    const startTime = Date.now();
    const spotlightRotationDuration = 1500; // 1.5 secondes pour la rotation du projecteur (6000/4)
    const spotlightCenterDuration = 500; // 0.5 secondes avec le projecteur au centre (2000/4)
    const revealDuration = 500; // 0.5 secondes pour révéler le vrai nom lettre par lettre (2000/4)
    const finalDisplayDuration = 1000; // 1 seconde pour l'affichage final (500ms + 500ms supplémentaires pour bien voir le nom)
    const totalDuration = spotlightRotationDuration + spotlightCenterDuration + revealDuration + finalDisplayDuration;
    const halfDuration = totalDuration / 2; // Moitié de l'animation pour commencer le mouvement de l'image

    // Générer des lettres aléatoires pour l'effet
    const generateRandomLetters = (length: number): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };

    // Initialiser les lettres aléatoires
    setRandomLetters(generateRandomLetters(winnerName.length));
    
    // Initialiser la position de l'image du gagnant au centre
    setImagePosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 + 200 });
    
    // Initialiser les images flottantes - utiliser uniquement l'image du gagnant (ou les images du couple)
    const availableImages: string[] = [];
    
    // Si winnerImage2 est présent, c'est un couple (pairing)
    if (winnerImage2) {
      // Pour les couples, utiliser les deux images (normalisées)
      const normalizedImage1 = normalizeImagePath(winnerImage);
      const normalizedImage2 = normalizeImagePath(winnerImage2);
      if (normalizedImage1) availableImages.push(normalizedImage1);
      if (normalizedImage2) availableImages.push(normalizedImage2);
    } else if (winnerImage) {
      // Pour les autres types, utiliser uniquement l'image du gagnant (normalisée)
      const normalizedImage = normalizeImagePath(winnerImage);
      if (normalizedImage) availableImages.push(normalizedImage);
    }
    
    // Si aucune image n'est disponible, ne pas créer d'images flottantes
    if (availableImages.length === 0) {
      setFloatingImages([]);
      floatingImagesRef.current = [];
    } else {
      // Dupliquer chaque image 4 fois avec des positions différentes
      const duplicatesPerImage = 4;
      const initialFloatingImages: Array<{
        id: number;
        image: string;
        position: { x: number; y: number };
        size: number;
        lastMove: number;
      }> = [];
      
      availableImages.forEach((image, imageIndex) => {
        for (let duplicateIndex = 0; duplicateIndex < duplicatesPerImage; duplicateIndex++) {
          const size = 80 + Math.random() * 120; // Tailles entre 80px et 200px
          const maxX = window.innerWidth - size;
          const maxY = window.innerHeight - size;
          const minX = size;
          const minY = size;
          
          // Position différente pour chaque duplication
          const positionX = Math.random() * (maxX - minX) + minX;
          const positionY = Math.random() * (maxY - minY) + minY;
          
          initialFloatingImages.push({
            id: imageIndex * duplicatesPerImage + duplicateIndex,
            image: image,
            position: {
              x: positionX,
              y: positionY,
            },
            size,
            lastMove: 0,
          });
        }
      });
      
      setFloatingImages(initialFloatingImages);
      floatingImagesRef.current = initialFloatingImages;
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      
      // Calculer l'opacité actuelle de l'image pour déterminer si elle doit bouger
      let currentImageOpacity = 0;
      if (elapsed >= spotlightRotationDuration + spotlightCenterDuration) {
        if (elapsed < spotlightRotationDuration + spotlightCenterDuration + revealDuration) {
          currentImageOpacity = (elapsed - spotlightRotationDuration - spotlightCenterDuration) / revealDuration;
        } else {
          currentImageOpacity = 1;
        }
      }

      // Mouvement aléatoire de l'image du gagnant à partir de la moitié de l'animation
      if (elapsed >= halfDuration && currentImageOpacity > 0) {
        // Changer la position de l'image toutes les 200ms
        if (elapsed - lastImageMoveRef.current >= 200) {
          const maxX = window.innerWidth - 200;
          const maxY = window.innerHeight - 200;
          const minX = 200;
          const minY = 200;
          
          setImagePosition({
            x: Math.random() * (maxX - minX) + minX,
            y: Math.random() * (maxY - minY) + minY,
          });
          lastImageMoveRef.current = elapsed;
        }
      }
      
      // Mouvement aléatoire des images flottantes dès le début
      if (floatingImagesRef.current.length > 0) {
        const updatedFloatingImages = floatingImagesRef.current.map((img, index) => {
          // Changer la position toutes les 300-500ms (différents intervalles pour chaque image)
          const moveInterval = 300 + (index % 3) * 100;
          if (elapsed - img.lastMove >= moveInterval) {
            const maxX = window.innerWidth - img.size;
            const maxY = window.innerHeight - img.size;
            const minX = img.size;
            const minY = img.size;
            
            return {
              ...img,
              position: {
                x: Math.random() * (maxX - minX) + minX,
                y: Math.random() * (maxY - minY) + minY,
              },
              lastMove: elapsed,
            };
          }
          return img;
        });
        
        // Mettre à jour seulement si quelque chose a changé
        const hasChanged = updatedFloatingImages.some((img, i) => 
          img.position.x !== floatingImagesRef.current[i]?.position.x ||
          img.position.y !== floatingImagesRef.current[i]?.position.y
        );
        
        if (hasChanged) {
          floatingImagesRef.current = updatedFloatingImages;
          setFloatingImages([...updatedFloatingImages]);
        }
      }

      // Phase 1 : Projecteur qui tourne lentement (0 à 1.5 secondes)
      if (elapsed < spotlightRotationDuration) {
        const spotlightProgress = elapsed / spotlightRotationDuration;
        // Mouvement circulaire plus lent et doux (1.5 tours au lieu de 2)
        const angle = spotlightProgress * Math.PI * 3; // 1.5 tours complets
        const radius = 200;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        setSpotlightPosition({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        });

        // Mettre à jour les lettres aléatoires pendant la rotation (toutes les 20ms, divisé par 4)
        if (elapsed - lastLetterUpdateRef.current >= 20) {
          setRandomLetters(generateRandomLetters(winnerName.length));
          lastLetterUpdateRef.current = elapsed;
        }
        
        setRevealProgress(0); // Pas encore de révélation
        setImageOpacity(0); // Image du gagnant pas encore visible
      }
      // Phase 2 : Projecteur se déplace vers le centre avec lettres aléatoires (1.5 à 2 secondes)
      else if (elapsed < spotlightRotationDuration + spotlightCenterDuration) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        // Transition fluide vers le centre
        const transitionProgress = (elapsed - spotlightRotationDuration) / spotlightCenterDuration;
        const startAngle = (Math.PI * 3); // Position finale de la phase 1
        const startX = centerX + Math.cos(startAngle) * 200;
        const startY = centerY + Math.sin(startAngle) * 200;
        
        // Interpolation linéaire vers le centre
        setSpotlightPosition({
          x: startX + (centerX - startX) * transitionProgress,
          y: startY + (centerY - startY) * transitionProgress,
        });

        // Continuer à changer les lettres aléatoires (toutes les 20ms)
        if (elapsed - lastLetterUpdateRef.current >= 20) {
          setRandomLetters(generateRandomLetters(winnerName.length));
          lastLetterUpdateRef.current = elapsed;
        }
        
        setRevealProgress(0);
        setImageOpacity(0); // Image du gagnant pas encore visible
      }
      // Phase 3 : Révélation progressive du vrai nom (2 à 2.5 secondes)
      else if (elapsed < spotlightRotationDuration + spotlightCenterDuration + revealDuration) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        setSpotlightPosition({ x: centerX, y: centerY });

        const revealProgress = (elapsed - spotlightRotationDuration - spotlightCenterDuration) / revealDuration;
        setRevealProgress(revealProgress);
        
        // Continuer à changer les lettres aléatoires pour les positions non révélées (toutes les 20ms)
        if (elapsed - lastLetterUpdateRef.current >= 20) {
          setRandomLetters(generateRandomLetters(winnerName.length));
          lastLetterUpdateRef.current = elapsed;
        }
        
        // Opacité progressive de l'image
        setImageOpacity(revealProgress);
      }
      // Phase 4 : Affichage complet (après 2.5 secondes)
      else {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        setSpotlightPosition({ x: centerX, y: centerY });
        setRevealProgress(1);
        setImageOpacity(1);
        
        if (!showFullResult) {
          setShowFullResult(true);
          // Attendre encore 1 seconde avant d'appeler onComplete (pour bien voir le nom)
          finalDisplayTimeoutRef.current = setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
              audioRef.current = null;
            }
            onComplete();
          }, finalDisplayDuration);
        }
      }

      if (elapsed < totalDuration) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      // Nettoyer complètement toutes les ressources
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioRef.current) {
        // Nettoyer l'event listener si présent
        if (audioEventListenerRef.current) {
          audioRef.current.removeEventListener('canplaythrough', audioEventListenerRef.current);
          audioEventListenerRef.current = null;
        }
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      if (soundTimeoutRef.current) {
        clearTimeout(soundTimeoutRef.current);
        soundTimeoutRef.current = null;
      }
      if (finalDisplayTimeoutRef.current) {
        clearTimeout(finalDisplayTimeoutRef.current);
        finalDisplayTimeoutRef.current = null;
      }
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
    };
  }, [question, winnerName, winnerImage, winnerImage2, onComplete]);

  // Calculer le texte à afficher selon la phase de l'animation
  const getDisplayedText = () => {
    if (showFullResult) return winnerName;
    if (revealProgress === 0) return randomLetters; // Phase lettres aléatoires
    if (revealProgress >= 1) return winnerName;
    
    // Phase de révélation progressive : mélanger lettres aléatoires et vraies lettres
    const totalChars = winnerName.length;
    const revealedChars = Math.floor(totalChars * revealProgress);
    
    // Utiliser les lettres aléatoires existantes pour les positions non révélées
    return winnerName
      .split('')
      .map((char, index) => {
        if (index < revealedChars) {
          return char; // Afficher la vraie lettre
        } else {
          // Utiliser la lettre aléatoire correspondante de randomLetters
          return randomLetters[index] || ' ';
        }
      })
      .join('');
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Titre de la question en haut */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'white',
          fontSize: '32px',
          fontWeight: '700',
          textAlign: 'center',
          padding: '0 20px',
          zIndex: 10001,
          textShadow: '0 2px 10px rgba(255, 255, 255, 0.3)',
        }}
      >
        {question}
      </div>

      {/* Projecteur mobile */}
      {!showFullResult && (
        <div
          style={{
            position: 'absolute',
            left: `${spotlightPosition.x}px`,
            top: `${spotlightPosition.y}px`,
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 40%, transparent 70%)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 10000,
            transition: revealProgress === 0 ? 'all 0.05s linear' : 'all 0.3s ease-out',
            boxShadow: '0 0 100px rgba(255, 255, 255, 0.6)',
          }}
        />
      )}

      {/* Texte révélé */}
      <div
        style={{
          position: 'relative',
          color: 'white',
          fontSize: '64px',
          fontWeight: '900',
          textAlign: 'center',
          fontFamily: 'Arial, sans-serif',
          letterSpacing: '8px',
          textTransform: 'uppercase',
          zIndex: 10001,
          minHeight: '100px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textShadow: showFullResult 
            ? '0 0 30px rgba(255, 255, 255, 0.8), 0 0 60px rgba(255, 255, 255, 0.5)'
            : '0 0 20px rgba(255, 255, 255, 0.5)',
          transition: 'all 0.5s ease',
        }}
      >
        {getDisplayedText()}
      </div>

      {/* Images flottantes (5-10 images dès le début) */}
      {floatingImages.map((floatingImg) => (
        <div
          key={floatingImg.id}
          style={{
            position: 'absolute',
            left: `${floatingImg.position.x}px`,
            top: `${floatingImg.position.y}px`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.6,
            transition: 'left 0.3s ease-out, top 0.3s ease-out',
            zIndex: 9998,
            width: `${floatingImg.size}px`,
            height: `${floatingImg.size}px`,
          }}
        >
          <img
            src={floatingImg.image}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 15px rgba(255, 255, 255, 0.5))',
            }}
            onError={(e) => {
              // Si l'image ne charge pas, masquer l'élément
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ))}

      {/* Image(s) du gagnant */}
      {winnerImage && (
        <div
          style={{
            position: 'absolute',
            left: `${imagePosition.x}px`,
            top: `${imagePosition.y}px`,
            transform: 'translate(-50%, -50%)',
            opacity: imageOpacity,
            transition: 'left 0.2s ease-out, top 0.2s ease-out, opacity 0.125s ease',
            zIndex: 10001,
            maxWidth: winnerImage2 ? '800px' : '400px',
            maxHeight: '400px',
            animation: showFullResult ? 'pulse 0.25s ease-in-out infinite' : 'none',
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={normalizeImagePath(winnerImage) || ''}
            alt={winnerName}
            style={{
              width: winnerImage2 ? '300px' : '100%',
              height: winnerImage2 ? '300px' : '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 30px rgba(255, 255, 255, 0.8))',
            }}
            onError={(e) => {
              console.warn('Image non chargée:', winnerImage);
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            onLoad={() => {
              console.log('Image chargée avec succès:', winnerImage);
            }}
          />
          {winnerImage2 && (
            <>
              <span style={{ 
                fontSize: '48px', 
                color: 'white', 
                fontWeight: 'bold',
                textShadow: '0 0 20px rgba(255, 255, 255, 0.8)'
              }}>
                &
              </span>
              <img
                src={normalizeImagePath(winnerImage2) || ''}
                alt=""
                style={{
                  width: '300px',
                  height: '300px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 30px rgba(255, 255, 255, 0.8))',
                }}
                onError={(e) => {
                  console.warn('Image non chargée:', winnerImage2);
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
                onLoad={() => {
                  console.log('Image chargée avec succès:', winnerImage2);
                }}
              />
            </>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            transform: translate(-50%, -50%) scale(1.05);
          }
        }
      `}</style>
    </div>
  );
}
