'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Modal from '@/app/components/Modal';
import RevealAnimation from '@/app/components/RevealAnimation';

// Types pour les options avec image et son
interface Option {
  text: string;
  image?: string;
  sound?: string;
}

// Fonction helper pour obtenir le texte d'une option
const getOptionText = (option: string | Option): string => {
  if (typeof option === 'string') {
    return option;
  }
  return option.text;
};

// Fonction utilitaire pour nettoyer complètement une session (toutes les sous-collections)
const cleanupSession = async (sessionId: string) => {
  try {
    console.log('🧹 Nettoyage de la session:', sessionId);
    const sessionRef = doc(db, 'sessions', sessionId);
    
    // Supprimer tous les participants (même si le document de session n'existe pas)
    try {
      const participantsRef = collection(db, 'sessions', sessionId, 'participants');
      const participantsSnapshot = await getDocs(participantsRef);
      if (participantsSnapshot.size > 0) {
        const batch1 = writeBatch(db);
        participantsSnapshot.forEach((doc) => {
          batch1.delete(doc.ref);
        });
        await batch1.commit();
        console.log(`✅ ${participantsSnapshot.size} participant(s) supprimé(s)`);
      }
    } catch (error: any) {
      // Si la collection n'existe pas, ce n'est pas grave
      if (error?.code !== 'not-found') {
        console.warn('⚠️ Erreur lors de la suppression des participants:', error);
      }
    }
    
    // Supprimer toutes les questions de session (même si le document de session n'existe pas)
    try {
      const questionsRef = collection(db, 'sessions', sessionId, 'questions');
      const questionsSnapshot = await getDocs(questionsRef);
      if (questionsSnapshot.size > 0) {
        const batch2 = writeBatch(db);
        questionsSnapshot.forEach((doc) => {
          batch2.delete(doc.ref);
        });
        await batch2.commit();
        console.log(`✅ ${questionsSnapshot.size} question(s) de session supprimée(s)`);
      }
    } catch (error: any) {
      // Si la collection n'existe pas, ce n'est pas grave
      if (error?.code !== 'not-found') {
        console.warn('⚠️ Erreur lors de la suppression des questions:', error);
      }
    }
    
    // Supprimer le document de session principal (seulement s'il existe)
    try {
      const sessionDoc = await getDoc(sessionRef);
      if (sessionDoc.exists()) {
        await deleteDoc(sessionRef);
        console.log('✅ Document de session supprimé');
      }
    } catch (error: any) {
      // Si le document n'existe pas, ce n'est pas grave
      if (error?.code !== 'not-found') {
        console.warn('⚠️ Erreur lors de la suppression du document de session:', error);
      }
    }
    
    console.log('✅ Session complètement nettoyée');
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage de la session:', error);
    throw error;
  }
};

// Fonction helper pour obtenir l'image d'une option
const getOptionImage = (option: string | Option): string | undefined => {
  if (typeof option === 'string') {
    return undefined;
  }
  return option.image;
};

// Fonction pour générer des commentaires drôles basés sur la position
const getFunnyComment = (rank: number, total: number, votes: number, maxVotes: number, type: 'multiple-choice' | 'ranking' | 'pairing' = 'multiple-choice'): string => {
  const percentage = total > 0 ? (votes / total) * 100 : 0;
  const isWinner = rank === 0;
  const isLast = rank === total - 1;
  
  if (type === 'multiple-choice') {
    if (isWinner && percentage > 50) {
      return '🏆 Le grand gagnant ! Domination totale !';
    }
    if (isWinner && percentage > 30) {
      return '🥇 Premier de la classe ! Bien joué !';
    }
    if (isWinner) {
      return '🎯 Gagnant par la peau des dents !';
    }
    if (rank === 1 && percentage > 20) {
      return '🥈 Presque là ! Le podium te tend les bras !';
    }
    if (rank === 2) {
      return '🥉 Troisième place ! Pas mal du tout !';
    }
    if (rank <= total / 3 && percentage > 10) {
      return '👍 Dans le top tier ! Respect !';
    }
    if (rank <= total / 2 && percentage > 5) {
      return '😊 Dans la moyenne, c\'est déjà ça !';
    }
    if (isLast && votes === 0) {
      return '😅 Personne ne t\'a choisi... Mais on t\'aime quand même !';
    }
    if (isLast) {
      return '💪 Dernier mais pas le moins courageux !';
    }
    if (rank > total * 0.8 && percentage < 3) {
      return '🔥 En bas du panier mais tu brûles quand même !';
    }
    if (rank > total * 0.75 && votes === 1) {
      return '💀 Un seul vote... Au moins quelqu\'un t\'aime !';
    }
    if (rank > total * 0.7 && percentage < 5) {
      return '😬 Dans les profondeurs du classement... Courage !';
    }
    if (percentage < 5) {
      return '🤷 Quelques votes, c\'est mieux que rien !';
    }
    if (rank > total * 0.6) {
      return '📉 Ça descend... Mais tu restes debout !';
    }
    return '📊 Dans le classement, c\'est déjà bien !';
  }
  
  if (type === 'ranking') {
    const position = rank + 1;
    if (position === 1) {
      return '👑 Numéro 1 ! Le roi/la reine du classement !';
    }
    if (position === 2) {
      return '🥈 Vice-champion(ne) ! Presque au sommet !';
    }
    if (position === 3) {
      return '🥉 Troisième ! Le podium est à toi !';
    }
    if (position <= total / 4) {
      return '⭐ Dans le top quart ! Excellent classement !';
    }
    if (position <= total / 2) {
      return '👍 Au-dessus de la moyenne ! Pas mal !';
    }
    if (position > total * 0.75) {
      return '😅 En bas du classement... Mais tu restes dans le cœur !';
    }
    return '📊 Position moyenne, c\'est déjà ça !';
  }
  
  if (type === 'pairing') {
    if (isWinner && percentage > 50) {
      return '💑 Le couple parfait ! Tout le monde vous voit ensemble !';
    }
    if (isWinner && percentage > 30) {
      return '💕 Le couple préféré ! Vous êtes faits l\'un pour l\'autre !';
    }
    if (isWinner) {
      return '💖 Couple gagnant ! L\'amour triomphe !';
    }
    if (rank === 1 && percentage > 20) {
      return '💝 Presque premiers ! Un couple très apprécié !';
    }
    if (rank === 2) {
      return '💗 Troisième place ! Un beau couple quand même !';
    }
    if (rank <= total / 3 && percentage > 10) {
      return '💓 Dans le top tier des couples !';
    }
    if (rank <= total / 2 && percentage > 5) {
      return '💞 Un couple qui a sa place !';
    }
    if (isLast && votes === 0) {
      return '💔 Personne ne vous a mis ensemble... Mais l\'amour peut naître !';
    }
    if (isLast) {
      return '💙 Derniers mais pas les moins courageux !';
    }
    if (rank > total * 0.8 && percentage < 3) {
      return '🔥 En bas du classement des couples... Mais l\'amour brûle encore !';
    }
    if (rank > total * 0.75 && votes === 1) {
      return '💀 Un seul vote... Au moins quelqu\'un croit en votre couple !';
    }
    if (rank > total * 0.7 && percentage < 5) {
      return '😬 Dans les profondeurs... Mais l\'amour résiste !';
    }
    if (percentage < 5) {
      return '💜 Quelques votes, c\'est un début !';
    }
    if (rank > total * 0.6) {
      return '📉 Ça descend pour le couple... Mais vous tenez bon !';
    }
    return '💚 Un couple qui mérite d\'être célébré !';
  }
  
  return '💫 Un couple qui mérite d\'être célébré !';
};

// Fonction pour choisir un style d'affichage aléatoire
const getDisplayStyle = (questionIndex: number): 'podium' | 'bars' | 'stars' | 'cards' => {
  const styles: Array<'podium' | 'bars' | 'stars' | 'cards'> = ['podium', 'bars', 'stars', 'cards'];
  // Utiliser l'index de la question pour avoir un style cohérent par question
  return styles[questionIndex % styles.length];
};

// Le son (roulement de tambour) sera le même pour toutes les animations

export default function Home() {
  const [name, setName] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState(''); // Input pour l'ID de session
  const [sessionIdFromUrl, setSessionIdFromUrl] = useState(false); // Flag pour savoir si le sessionId vient de l'URL
  const [sessionId, setSessionId] = useState(''); // ID de session actuel (une fois connecté)
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [rankingOrder, setRankingOrder] = useState<number[]>([]); // Ordre pour les questions de type ranking
  const [pairingSelection, setPairingSelection] = useState<Array<[number, number]>>([]); // Couples sélectionnés pour les questions de type pairing
  const [pairingTempSelection, setPairingTempSelection] = useState<number | null>(null); // Première personne sélectionnée temporairement pour créer un couple
  const [categorizationAnswers, setCategorizationAnswers] = useState<{ [key: number]: number }>({}); // Réponses de catégorisation: { personIndex: categoryIndex } où categoryIndex = 0 (catégorie A) ou 1 (catégorie B)
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [questionTimer, setQuestionTimer] = useState<number | null>(null); // Compte à rebours entre questions
  const [questions, setQuestions] = useState<any[]>([]); // Questions chargées depuis Firestore
  const [isSpectator, setIsSpectator] = useState(false); // Mode spectateur (session terminée)
  const [resultsMode, setResultsMode] = useState(false); // Mode résultats (affichage un par un)
  const [currentResultIndex, setCurrentResultIndex] = useState(-1); // Index du résultat actuellement affiché
  const [showRevealAnimation, setShowRevealAnimation] = useState(false); // Contrôle l'affichage de l'animation de révélation
  const [revealAnimationData, setRevealAnimationData] = useState<{
    question: string;
    winnerName: string;
    winnerImage?: string;
    winnerImage2?: string; // Pour les couples (pairing)
    allOptions?: (string | Option)[];
  } | null>(null);
  const [lastAnimatedResultIndex, setLastAnimatedResultIndex] = useState<number>(-1); // Pour éviter de rejouer l'animation pour le même résultat
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(-1); // Index de la question actuelle depuis Firestore
  const [showBonusResults, setShowBonusResults] = useState(false); // Afficher les résultats bonus
  const router = useRouter();
  const hasCheckedLocalStorage = useRef(false); // Pour éviter les vérifications multiples du localStorage
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null); // Référence pour l'intervalle du timer
  const audioContextActivatedRef = useRef(false); // Pour éviter d'activer plusieurs fois le contexte audio
  
  // États pour les modals
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
  });

  // Fonction helper pour afficher une alerte
  const showAlert = (title: string, message: string) => {
    setModalState({
      isOpen: true,
      type: 'alert',
      title,
      message,
    });
  };

  // Charger les questions depuis le sondage associé à la session
  const loadQuestionsFromSurvey = useCallback(async (sid: string) => {
    try {
      const sessionRef = doc(db, 'sessions', sid);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        console.log('⚠️ Session n\'existe pas encore');
        setQuestions([]);
        return [];
      }

      const sessionData = sessionDoc.data();
      const surveyId = sessionData?.surveyId;

      if (!surveyId) {
        console.log('⚠️ Aucun sondage associé à cette session');
        setQuestions([]);
        return [];
      }

      // Charger les questions depuis le sondage
      const questionsRef = collection(db, 'surveys', surveyId, 'questions');
      const snapshot = await getDocs(questionsRef);
      const loadedQuestions: any[] = [];
      snapshot.forEach((doc) => {
        loadedQuestions.push({ id: doc.id, ...doc.data() });
      });
      // Trier par ID
      loadedQuestions.sort((a, b) => a.id.localeCompare(b.id));
      
      // Ajouter un index numérique pour l'affichage
      const questionsWithIndex = loadedQuestions.map((q, index) => ({
        ...q,
        id: index + 1, // Index pour l'affichage dans le quiz
        originalId: q.id, // Garder l'ID original
      }));
      
      setQuestions(questionsWithIndex);
      console.log('✅ Questions chargées depuis le sondage:', surveyId, '-', loadedQuestions.length, 'question(s)');
      return questionsWithIndex;
    } catch (error) {
      console.error('❌ Erreur lors du chargement des questions:', error);
      setQuestions([]);
      return [];
    }
  }, []);

  // Rejoindre une session existante uniquement
  const handleJoin = async () => {
    if (!name.trim()) {
      showAlert('Erreur', 'Veuillez entrer votre nom');
      return;
    }

    // Exiger un ID de session
    if (!sessionIdInput.trim()) {
      showAlert('Erreur', 'Veuillez entrer un ID de session pour rejoindre une session existante.');
      return;
    }

    // Valider l'ID de session (doit être uniquement numérique)
    if (!/^\d+$/.test(sessionIdInput.trim())) {
      showAlert('Erreur', 'L\'ID de session doit être uniquement un nombre (ex: 1234567890)');
      return;
    }

    const finalSessionId = sessionIdInput.trim();

    // Valider que l'ID est bien une string non vide
    if (!finalSessionId || typeof finalSessionId !== 'string') {
      showAlert('Erreur', 'ID de session invalide');
      return;
    }

    console.log('🔗 Tentative de connexion:', {
      name,
      sessionIdInput,
      finalSessionId,
    });

    try {
      const sessionRef = doc(db, 'sessions', finalSessionId);
      const sessionDoc = await getDoc(sessionRef);

      console.log('📄 État de la session:', {
        exists: sessionDoc.exists(),
        finalSessionId,
      });

      // Vérifier que la session existe - ne pas permettre la création automatique
      if (!sessionDoc.exists()) {
        showAlert(
          'Session introuvable', 
          `La session avec l'ID "${finalSessionId}" n'existe pas.\n\n` +
          `Vérifiez que vous avez bien saisi l'ID de session correct.\n\n` +
          `Les sessions doivent être créées depuis le panneau administrateur avant de pouvoir y rejoindre.`
        );
        console.error('❌ Session introuvable:', finalSessionId);
        // Réinitialiser les champs pour permettre une nouvelle tentative
        setSessionIdInput('');
        setSessionIdFromUrl(false);
        return;
      }

      // Récupérer les données de la session existante
      const sessionData = sessionDoc.data();

      // Charger les questions pour vérifier si la session est terminée
      let loadedQuestions: any[] = [];
      if (sessionData?.surveyId) {
        try {
          const questionsRef = collection(db, 'surveys', sessionData.surveyId, 'questions');
          const questionsSnapshot = await getDocs(questionsRef);
          questionsSnapshot.forEach((doc) => {
            loadedQuestions.push({ id: doc.id, ...doc.data() });
          });
          loadedQuestions.sort((a, b) => a.id.localeCompare(b.id));
          // Ajouter un index numérique pour l'affichage
          loadedQuestions = loadedQuestions.map((q, index) => ({
            ...q,
            id: index + 1,
            originalId: q.id,
          }));
        } catch (error) {
          console.error('Erreur lors du chargement des questions:', error);
        }
      }

      // Vérifier si la session est terminée
      const currentQuestionIndex = sessionData?.currentQuestionIndex ?? -1;
      const isSessionFinished = loadedQuestions.length > 0 && currentQuestionIndex >= loadedQuestions.length;
      
      // Déterminer le statut admin (déclaré avant les blocs if/else)
      let userIsAdmin = false;
      
      if (isSessionFinished) {
        console.log('👁️ Session terminée - Mode spectateur activé');
        setIsSpectator(true);
        // Vérifier si l'utilisateur est l'admin original pour garder les droits de contrôle
        const isOriginalAdmin = sessionData?.adminName === name;
        userIsAdmin = isOriginalAdmin;
        setIsAdmin(isOriginalAdmin);
        if (isOriginalAdmin) {
          console.log('👑 Vous êtes l\'administrateur original - Vous pouvez contrôler l\'affichage des résultats');
        }
        // Ne pas ajouter de participant pour ne pas ruiner les stats
        // Mais permettre de voir les résultats
      } else {
        setIsSpectator(false);
        
        // Vérifier si la session a déjà un admin
        const hasAdmin = sessionData?.adminName && sessionData.adminName.trim() !== '';
        
        // Si pas d'admin, le premier participant devient admin
        if (!hasAdmin) {
          console.log('👑 Aucun admin trouvé, vous devenez l\'administrateur');
          await updateDoc(sessionRef, {
            adminName: name,
          });
          userIsAdmin = true;
          setIsAdmin(true);
          console.log('✅ Vous êtes maintenant l\'administrateur de cette session');
        } else {
          // Rejoindre une session existante avec admin
          if (sessionData?.adminName === name) {
            userIsAdmin = true;
            setIsAdmin(true);
            console.log('✅ Vous êtes l\'administrateur de cette session');
            console.log('🔍 Vérification admin:', { adminName: sessionData.adminName, userName: name, match: sessionData.adminName === name });
          } else {
            userIsAdmin = false;
            setIsAdmin(false);
            console.log('👤 Vous rejoignez en tant que participant');
            console.log('🔍 Vérification admin:', { adminName: sessionData.adminName, userName: name, match: sessionData.adminName === name });
          }
        }

        // Ajouter le participant seulement si la session n'est pas terminée
        const participantRef = doc(
          db,
          'sessions',
          finalSessionId,
          'participants',
          name
        );
        console.log('📝 Ajout du participant:', name, 'dans la session:', finalSessionId);
        
        // Vérifier si le participant existe déjà
        const existingParticipant = await getDoc(participantRef);
        if (existingParticipant.exists()) {
          console.log('⚠️ Participant existe déjà, mise à jour...');
        }
        
        await setDoc(participantRef, {
          name,
          answers: {},
          score: 0,
          joinedAt: new Date(),
        });
        
        // Vérifier que le participant a bien été ajouté
        const verifyParticipant = await getDoc(participantRef);
        if (verifyParticipant.exists()) {
          console.log('✅ Participant ajouté avec succès dans Firestore:', verifyParticipant.data());
        } else {
          console.error('❌ ERREUR: Le participant n\'a pas été ajouté à Firestore!');
          showAlert('Erreur', 'Impossible d\'ajouter le participant à la base de données');
          return;
        }
      }

      // Mettre à jour l'état et le localStorage
      setSessionId(finalSessionId);
      localStorage.setItem('sessionId', finalSessionId);
      localStorage.setItem('participantName', name);
      // Utiliser la valeur calculée directement, pas l'état qui peut ne pas être à jour
      // En mode spectateur, vérifier si on est l'admin original
      const finalAdminStatus = isSessionFinished 
        ? (userIsAdmin || sessionData?.adminName === name)
        : (userIsAdmin || sessionData?.adminName === name);
      localStorage.setItem('isAdmin', String(finalAdminStatus));
      localStorage.setItem('isSpectator', String(isSessionFinished));
      console.log('💾 Sauvegarde localStorage:', { 
        sessionId: finalSessionId, 
        name, 
        isAdmin: finalAdminStatus,
        adminNameInDB: sessionData?.adminName 
      });
      
      // Si mode spectateur, charger directement les résultats finaux
      if (isSessionFinished && loadedQuestions.length > 0) {
        setQuestions(loadedQuestions);
        setShowResults(true);
        await loadFinalResults(finalSessionId);
        // S'assurer que la session est en mode résultats si ce n'est pas déjà le cas
        if (!sessionData?.resultsMode) {
          await updateDoc(sessionRef, {
            resultsMode: true,
            currentResultIndex: 0,
          });
        }
      }

      // Écouter les changements de session
      console.log('👂 Démarrage de l\'écoute pour la session:', finalSessionId);
      listenToSession(finalSessionId);
    } catch (error: any) {
      console.error('❌ Erreur lors de la connexion:', error);
      
      // Gestion d'erreur plus détaillée
      let errorMessage = 'Une erreur est survenue lors de la connexion à la session.';
      
      if (error?.code === 'permission-denied') {
        errorMessage = 'Vous n\'avez pas la permission d\'accéder à cette session.';
      } else if (error?.code === 'unavailable') {
        errorMessage = 'Le service est temporairement indisponible. Veuillez réessayer plus tard.';
      } else if (error?.code === 'not-found') {
        errorMessage = 'La session demandée n\'existe pas. Vérifiez l\'ID de session.';
      } else if (error?.message) {
        errorMessage = `Erreur: ${error.message}`;
      }
      
      showAlert('Erreur de connexion', errorMessage);
      // Ne pas réinitialiser les champs en cas d'erreur réseau pour permettre une nouvelle tentative
    }
  };

  // Charger les résultats finaux avec statistiques
  const loadFinalResults = useCallback(async (sid: string) => {
    const participantsRef = collection(db, 'sessions', sid, 'participants');
    const snapshot = await getDocs(participantsRef);
    const parts: any[] = [];
    snapshot.forEach((doc) => {
      parts.push({ id: doc.id, ...doc.data() });
    });
    setResults(parts);
    setShowResults(true);
  }, []);

  // Calculer les statistiques de votes par question
  const calculateQuestionStats = useCallback(() => {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return [];
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return [];
    }
    
    try {
      return questions.map((question: any, questionIndex: number) => {
        if (!question) return null;
        
        const stats: any = {
          question: question.question || '',
          questionIndex,
          type: question.type || 'multiple-choice',
          options: Array.isArray(question.options) ? question.options : [],
          votes: {},
          totalVotes: 0,
        };

        // Compter les votes pour chaque option
        if (question.type === 'ranking') {
          // Pour ranking, collecter les positions pour chaque option
          const optionPositions: { [key: number]: number[] } = {};
          
          results.forEach((participant: any) => {
            if (participant && participant.answers && typeof participant.answers === 'object') {
              const answer = participant.answers[questionIndex];
              if (answer !== undefined && answer !== null && Array.isArray(answer)) {
                // Vérifier que la réponse est valide (doit contenir toutes les options)
                if (answer.length === question.options.length) {
                  stats.totalVotes++;
                  
                  // answer[position] = optionIndex
                  // Par exemple, si answer = [2, 0, 1], cela signifie:
                  // - Position 0 (1ère place) : option index 2
                  // - Position 1 (2ème place) : option index 0
                  // - Position 2 (3ème place) : option index 1
                  answer.forEach((optionIndex: number, position: number) => {
                    // Valider que optionIndex est un nombre valide
                    if (typeof optionIndex === 'number' && optionIndex >= 0 && optionIndex < question.options.length) {
                      if (!optionPositions[optionIndex]) {
                        optionPositions[optionIndex] = [];
                      }
                      optionPositions[optionIndex].push(position);
                    } else {
                      console.warn('⚠️ OptionIndex invalide dans la réponse ranking:', {
                        optionIndex,
                        position,
                        answer,
                        participantId: participant.id || 'unknown',
                        questionIndex
                      });
                    }
                  });
                } else {
                  console.warn('⚠️ Réponse ranking invalide (longueur incorrecte):', {
                    answerLength: answer.length,
                    expectedLength: question.options.length,
                    answer,
                    participantId: participant.id || 'unknown',
                    questionIndex
                  });
                }
              }
            }
          });
          
          // Calculer la moyenne des positions pour chaque option
          stats.rankingAverages = {};
          Object.keys(optionPositions).forEach((optionIndexStr) => {
            const optionIndex = parseInt(optionIndexStr);
            const positions = optionPositions[optionIndex];
            if (positions.length > 0) {
              const sum = positions.reduce((acc, pos) => acc + pos, 0);
              const average = sum / positions.length;
              stats.rankingAverages[optionIndex] = {
                average: average,
                count: positions.length
              };
            }
          });
          
          console.log('📊 Statistiques ranking calculées:', {
            questionIndex,
            rankingAverages: stats.rankingAverages,
            totalVotes: stats.totalVotes,
            optionPositions
          });
        } else if (question.type === 'pairing') {
          // Pour pairing, compter tous les couples de tous les participants
          const coupleVotes: { [key: string]: number } = {};
          
          results.forEach((participant: any) => {
            if (participant && participant.answers && typeof participant.answers === 'object') {
              const answer = participant.answers[questionIndex];
              if (answer !== undefined && answer !== null && Array.isArray(answer)) {
                if (answer.length > 0 && answer.length % 2 === 0) {
                  // Format nouveau : tableau plat [a, b, c, d, ...] où chaque paire est un couple
                  stats.totalVotes++;
                  for (let i = 0; i < answer.length; i += 2) {
                    if (i + 1 < answer.length) {
                      const [first, second] = answer[i] < answer[i + 1] 
                        ? [answer[i], answer[i + 1]] 
                        : [answer[i + 1], answer[i]];
                      const coupleKey = `${first},${second}`;
                      coupleVotes[coupleKey] = (coupleVotes[coupleKey] || 0) + 1;
                    }
                  }
                } else if (answer.length === 2 && typeof answer[0] === 'number') {
                  // Format ancien : un seul couple [a, b] (compatibilité)
                  stats.totalVotes++;
                  const [first, second] = answer[0] < answer[1] ? [answer[0], answer[1]] : [answer[1], answer[0]];
                  const coupleKey = `${first},${second}`;
                  coupleVotes[coupleKey] = (coupleVotes[coupleKey] || 0) + 1;
                }
              }
            }
          });
          
          stats.coupleVotes = coupleVotes;
        } else if (question.type === 'categorization') {
          // Pour categorization, compter pour chaque personne dans quelle catégorie elle est classée
          const personCategories: { [key: number]: { categoryA: number; categoryB: number } } = {};
          
          // Initialiser toutes les personnes
          question.options.forEach((_: any, index: number) => {
            personCategories[index] = { categoryA: 0, categoryB: 0 };
          });
          
          results.forEach((participant: any) => {
            if (participant && participant.answers && typeof participant.answers === 'object') {
              const answer = participant.answers[questionIndex];
              if (answer !== undefined && answer !== null && typeof answer === 'object' && !Array.isArray(answer)) {
                stats.totalVotes++;
                
                // answer est un objet { personIndex: categoryIndex } où categoryIndex = 0 (catégorie A) ou 1 (catégorie B)
                Object.keys(answer).forEach((personIndexStr) => {
                  const personIndex = parseInt(personIndexStr);
                  const categoryIndex = answer[personIndex];
                  
                  if (typeof personIndex === 'number' && personIndex >= 0 && personIndex < question.options.length) {
                    if (categoryIndex === 0) {
                      personCategories[personIndex].categoryA++;
                    } else if (categoryIndex === 1) {
                      personCategories[personIndex].categoryB++;
                    }
                  }
                });
              }
            }
          });
          
          stats.personCategories = personCategories;
        } else {
          // Pour multiple-choice
          results.forEach((participant: any) => {
            if (participant && participant.answers && typeof participant.answers === 'object') {
              const answer = participant.answers[questionIndex];
              if (answer !== undefined && answer !== null && typeof answer === 'number') {
                stats.totalVotes++;
                stats.votes[answer] = (stats.votes[answer] || 0) + 1;
              }
            }
          });
        }

        return stats;
      }).filter((stat: any) => stat !== null);
    } catch (error) {
      console.error('Erreur lors du calcul des statistiques:', error);
      return [];
    }
  }, [results, questions]);

  // Fonction helper pour générer des commentaires drôles pour les stats bonus
  const getBonusFunnyComment = (first: number, second: number, third: number, rank: number): string => {
    const total = first + second + third;
    
    if (rank === 0 && first >= 3) {
      return '👑 Le roi/la reine incontesté(e) ! Domination totale !';
    }
    if (rank === 0 && first === 2) {
      return '🏆 Double champion(ne) ! Deux victoires brillantes !';
    }
    if (rank === 0 && first === 1) {
      return '⭐ Une fois au sommet, toujours au sommet !';
    }
    if (first >= 2) {
      return '🔥 En feu ! Plusieurs victoires à son actif !';
    }
    if (first === 1 && second >= 2) {
      return '💪 Toujours dans le top 3, très régulier(ère) !';
    }
    if (first === 1 && second === 1) {
      return '🎯 Toujours dans le top 2, excellent(e) !';
    }
    if (second >= 2) {
      return '🥈 Toujours deuxième, mais très constant(e) !';
    }
    if (third >= 2) {
      return '🥉 Toujours sur le podium, bravo !';
    }
    if (total >= 3) {
      return '✨ Très présent(e) dans les tops !';
    }
    if (total === 2) {
      return '👍 Deux apparitions dans les tops, pas mal !';
    }
    return '🌟 Une belle performance !';
  };

  // Calculer les statistiques bonus (combien de fois chaque option a été première, deuxième, etc.)
  const calculateBonusStats = useCallback(() => {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return null;
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return null;
    }

    try {
      // Structure : { optionText: { first: number, second: number, third: number } }
      // On regroupe par nom d'option uniquement, sans mentionner la question
      const bonusStats: { [key: string]: { first: number; second: number; third: number } } = {};
      
      questions.forEach((question: any, questionIndex: number) => {
        if (!question) return;
        
        const questionStats = calculateQuestionStats();
        const currentStat = questionStats[questionIndex];
        if (!currentStat) return;

        if (question.type === 'multiple-choice') {
          // Pour multiple-choice, trouver toutes les options gagnantes (les plus votées)
          let maxVotes = 0;
          const winnerOptionIndices: number[] = [];
          
          Object.keys(currentStat.votes || {}).forEach((optionIndexStr) => {
            const optionIndex = parseInt(optionIndexStr);
            const votes = currentStat.votes[optionIndex] || 0;
            if (votes > maxVotes) {
              maxVotes = votes;
              winnerOptionIndices.length = 0; // Réinitialiser
              winnerOptionIndices.push(optionIndex);
            } else if (votes === maxVotes && votes > 0) {
              winnerOptionIndices.push(optionIndex);
            }
          });

          // Compter toutes les options gagnantes comme premières
          winnerOptionIndices.forEach((winnerOptionIndex) => {
            if (currentStat.options && currentStat.options[winnerOptionIndex]) {
              const option = currentStat.options[winnerOptionIndex];
              const optionText = getOptionText(option);
              
              if (!bonusStats[optionText]) {
                bonusStats[optionText] = { first: 0, second: 0, third: 0 };
              }
              bonusStats[optionText].first = (bonusStats[optionText].first || 0) + 1;
            }
          });
        } else if (question.type === 'ranking') {
          // Pour ranking, trouver les 3 premières options
          if (currentStat.rankingAverages && currentStat.options) {
            const sortedOptions = Object.keys(currentStat.rankingAverages)
              .map(optIdx => parseInt(optIdx))
              .sort((a, b) => {
                const avgA = currentStat.rankingAverages[a]?.average ?? 999;
                const avgB = currentStat.rankingAverages[b]?.average ?? 999;
                return avgA - avgB;
              })
              .filter(optIdx => {
                const avgData = currentStat.rankingAverages[optIdx];
                return avgData && avgData.count > 0;
              });

            sortedOptions.slice(0, 3).forEach((optionIndex, rankIndex) => {
              if (currentStat.options[optionIndex]) {
                const option = currentStat.options[optionIndex];
                const optionText = getOptionText(option);
                
                if (!bonusStats[optionText]) {
                  bonusStats[optionText] = { first: 0, second: 0, third: 0 };
                }
                
                if (rankIndex === 0) {
                  bonusStats[optionText].first = (bonusStats[optionText].first || 0) + 1;
                } else if (rankIndex === 1) {
                  bonusStats[optionText].second = (bonusStats[optionText].second || 0) + 1;
                } else if (rankIndex === 2) {
                  bonusStats[optionText].third = (bonusStats[optionText].third || 0) + 1;
                }
              }
            });
          }
        } else if (question.type === 'pairing') {
          // Pour pairing, trouver le couple le plus choisi
          if (currentStat.coupleVotes && currentStat.options) {
            let maxVotes = 0;
            let bestCouple: [number, number] | null = null;
            
            Object.keys(currentStat.coupleVotes).forEach((coupleKey) => {
              const votes = currentStat.coupleVotes[coupleKey] || 0;
              if (votes > maxVotes) {
                maxVotes = votes;
                const [first, second] = coupleKey.split(',').map(Number);
                bestCouple = [first, second];
              }
            });

            if (bestCouple && currentStat.options[bestCouple[0]] && currentStat.options[bestCouple[1]]) {
              const option1 = currentStat.options[bestCouple[0]];
              const option2 = currentStat.options[bestCouple[1]];
              const optionText1 = getOptionText(option1);
              const optionText2 = getOptionText(option2);
              
              if (!bonusStats[optionText1]) {
                bonusStats[optionText1] = { first: 0, second: 0, third: 0 };
              }
              if (!bonusStats[optionText2]) {
                bonusStats[optionText2] = { first: 0, second: 0, third: 0 };
              }
              
              // Les deux options du couple gagnant sont comptées comme premières
              bonusStats[optionText1].first = (bonusStats[optionText1].first || 0) + 1;
              bonusStats[optionText2].first = (bonusStats[optionText2].first || 0) + 1;
            }
          }
        }
      });

      // Convertir en tableau trié par nombre de fois première
      const bonusArray = Object.keys(bonusStats).map(optionText => ({
        optionText,
        first: bonusStats[optionText].first || 0,
        second: bonusStats[optionText].second || 0,
        third: bonusStats[optionText].third || 0,
        total: (bonusStats[optionText].first || 0) + (bonusStats[optionText].second || 0) + (bonusStats[optionText].third || 0)
      })).sort((a, b) => {
        // Trier d'abord par nombre de fois première, puis deuxième, puis troisième
        if (b.first !== a.first) return b.first - a.first;
        if (b.second !== a.second) return b.second - a.second;
        return b.third - a.third;
      }).map((stat, index) => ({
        ...stat,
        rank: index,
        comment: getBonusFunnyComment(stat.first, stat.second, stat.third, index)
      }));

      return bonusArray;
    } catch (error) {
      console.error('Erreur lors du calcul des statistiques bonus:', error);
      return null;
    }
  }, [results, questions, calculateQuestionStats]);

  // Écouter les changements de session
  const listenToSession = useCallback((sid: string) => {
    // Valider que sid est bien une string valide
    if (!sid || typeof sid !== 'string' || sid.trim() === '') {
      console.error('❌ ID de session invalide:', sid);
      return;
    }

    const sessionRef = doc(db, 'sessions', sid);
    
    // Fonction helper pour gérer l'index de question
    const handleQuestionIndex = async (questionIndex: number, sessionData: any, sid: string, questionsToUse?: any[]) => {
      const questionsList = questionsToUse || questions;
      console.log('📊 Question index mis à jour:', questionIndex, '/', questionsList.length, 'questions disponibles');
      
      if (questionsList.length === 0) {
        console.log('⚠️ Aucune question disponible, attente du chargement...');
        return;
      }
      
      if (questionIndex >= 0 && questionIndex < questionsList.length) {
        console.log('✅ Affichage de la question:', questionIndex + 1);
        const question = questionsList[questionIndex];
        
        // RÉINITIALISER IMMÉDIATEMENT hasAnswered pour permettre la soumission de la nouvelle question
        // Cela évite que les utilisateurs ne puissent pas répondre pendant la transition
        setHasAnswered(false);
        
        setCurrentQuestion(question);
        setCurrentQuestionIndex(questionIndex);
        setShowResults(false);
        // Le timer sera réinitialisé via Firestore, pas besoin de le faire ici
        
        // Initialiser l'ordre pour les questions de type ranking
        if (question.type === 'ranking') {
          const initialOrder = question.options.map((_: any, index: number) => index);
          setRankingOrder(initialOrder);
        } else {
          setRankingOrder([]);
        }
        
        // Initialiser la sélection pour les questions de type pairing
        if (question.type === 'pairing') {
          setPairingSelection([]);
          setPairingTempSelection(null);
        } else {
          setPairingSelection([]);
          setPairingTempSelection(null);
        }
        
        // Initialiser les réponses de catégorisation
        if (question.type === 'categorization') {
          setCategorizationAnswers({});
        } else {
          setCategorizationAnswers({});
        }
        
        // Réinitialiser selectedAnswer pour les questions multiple-choice
        setSelectedAnswer(null);
        
        // Vérifier si l'utilisateur a déjà répondu (après avoir réinitialisé)
        if (name && name.trim() !== '') {
          const participantRef = doc(db, 'sessions', sid, 'participants', name);
          try {
            const participantDoc = await getDoc(participantRef);
            if (participantDoc.exists()) {
              const answers = participantDoc.data().answers || {};
              if (answers[questionIndex] !== undefined) {
                setHasAnswered(true);
                if (question.type === 'ranking' && Array.isArray(answers[questionIndex])) {
                  const savedRanking = answers[questionIndex];
                  // Valider que la réponse sauvegardée est valide
                  if (savedRanking.length === question.options.length) {
                    const sortedSavedRanking = [...savedRanking].sort((a, b) => a - b);
                    const expectedIndices = question.options.map((_: any, index: number) => index);
                    const isValidSavedRanking = sortedSavedRanking.every((val, idx) => val === expectedIndices[idx]);
                    if (isValidSavedRanking) {
                      setRankingOrder(savedRanking);
                      console.log('✅ Réponse ranking chargée:', {
                        questionIndex,
                        savedRanking,
                        question: question.question
                      });
                    } else {
                      console.warn('⚠️ Réponse ranking invalide lors du chargement, réinitialisation:', {
                        questionIndex,
                        savedRanking,
                        sortedSavedRanking,
                        expectedIndices
                      });
                      const initialOrder = question.options.map((_: any, index: number) => index);
                      setRankingOrder(initialOrder);
                      setHasAnswered(false); // Permettre de recommencer
                    }
                  } else {
                    console.warn('⚠️ Réponse ranking longueur incorrecte lors du chargement, réinitialisation:', {
                      questionIndex,
                      savedRankingLength: savedRanking.length,
                      expectedLength: question.options.length
                    });
                    const initialOrder = question.options.map((_: any, index: number) => index);
                    setRankingOrder(initialOrder);
                    setHasAnswered(false); // Permettre de recommencer
                  }
                                } else if (question.type === 'pairing' && Array.isArray(answers[questionIndex])) {
                                  // Charger les couples existants
                                  const couples = answers[questionIndex];
                                  if (Array.isArray(couples) && couples.length > 0) {
                                    // Format nouveau : tableau plat [a, b, c, d, ...] où chaque paire est un couple
                                    if (couples.length >= 2 && typeof couples[0] === 'number') {
                                      const loadedCouples: Array<[number, number]> = [];
                                      for (let i = 0; i < couples.length; i += 2) {
                                        if (i + 1 < couples.length) {
                                          loadedCouples.push([couples[i], couples[i + 1]]);
                                        }
                                      }
                                      setPairingSelection(loadedCouples);
                                    }
                                  }
                                } else if (question.type === 'categorization' && answers[questionIndex] && typeof answers[questionIndex] === 'object' && !Array.isArray(answers[questionIndex])) {
                                  // Charger les réponses de catégorisation
                                  setCategorizationAnswers(answers[questionIndex]);
                                } else {
                  setSelectedAnswer(answers[questionIndex]);
                }
              } else {
                setHasAnswered(false);
                setSelectedAnswer(null);
                if (question.type === 'ranking') {
                  const initialOrder = question.options.map((_: any, index: number) => index);
                  setRankingOrder(initialOrder);
                } else if (question.type === 'pairing') {
                  setPairingSelection([]);
                  setPairingTempSelection(null);
                } else if (question.type === 'categorization') {
                  setCategorizationAnswers({});
                } else if (question.type === 'categorization') {
                  setCategorizationAnswers({});
                }
              }
            }
          } catch (error) {
            console.error('Erreur lors de la vérification des réponses:', error);
          }
        }
      } else if (questionIndex === questionsList.length) {
        // Mode résultats - ne rien faire ici, géré par resultsMode
        console.log('🏆 Mode résultats activé');
        setCurrentQuestionIndex(questionIndex);
        setQuestionTimer(null);
      } else if (questionIndex === -1) {
        // En attente du début du sondage
        console.log('⏳ En attente du début du sondage');
        setCurrentQuestion(null);
        setCurrentQuestionIndex(-1);
        setShowResults(false);
        setQuestionTimer(null);
      }
    };

    onSnapshot(sessionRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        console.log('⚠️ Session supprimée ou inexistante');
        return;
      }

      // Mettre à jour l'index de la question actuelle
      const questionIndex = data.currentQuestionIndex ?? -1;
      setCurrentQuestionIndex(questionIndex);

      // Mettre à jour le statut admin si nécessaire
      if (name && name.trim() !== '') {
        const currentAdminStatus = data.adminName === name;
        if (currentAdminStatus !== isAdmin) {
          console.log('🔄 Mise à jour du statut admin:', { 
            adminName: data.adminName, 
            userName: name, 
            wasAdmin: isAdmin, 
            nowAdmin: currentAdminStatus 
          });
          setIsAdmin(currentAdminStatus);
          localStorage.setItem('isAdmin', String(currentAdminStatus));
        }
      }

      // Vérifier le mode résultats
      const isResultsMode = data.resultsMode === true;
      const resultIndex = data.currentResultIndex ?? -1;
      
      if (isResultsMode) {
        setResultsMode(true);
        setShowResults(true);
        setCurrentQuestion(null);
        setQuestionTimer(null);
        
        // Charger les questions si nécessaire
        let loadedQuestions = questions;
        if (questions.length === 0 && data.surveyId) {
          loadedQuestions = await loadQuestionsFromSurvey(sid) || [];
        }
        
        // Charger les résultats si nécessaire
        if (results.length === 0) {
          await loadFinalResults(sid);
        }
        
        // Mettre à jour l'index du résultat affiché - utiliser loadedQuestions au lieu de questions car l'état React n'est pas encore mis à jour
        if (loadedQuestions.length > 0) {
          if (resultIndex >= 0 && resultIndex < loadedQuestions.length) {
            // Si le résultat change, réinitialiser l'animation
            if (resultIndex !== currentResultIndex) {
              setShowRevealAnimation(false);
              setRevealAnimationData(null);
              setLastAnimatedResultIndex(-1);
            }
            setCurrentResultIndex(resultIndex);
          } else if (resultIndex === -1 || resultIndex < 0) {
            // Initialiser à 0 si pas encore défini (seulement si admin)
            if (isAdmin) {
              await updateDoc(sessionRef, { currentResultIndex: 0 });
            }
            setCurrentResultIndex(0);
          }
        } else {
          // Si les questions ne sont pas encore chargées, définir quand même currentResultIndex avec la valeur de Firestore
          // Cela évite que currentResultIndex reste à -1 pendant le chargement
          if (resultIndex >= 0) {
            // Si le résultat change, réinitialiser l'animation
            if (resultIndex !== currentResultIndex) {
              setShowRevealAnimation(false);
              setRevealAnimationData(null);
              setLastAnimatedResultIndex(-1);
            }
            setCurrentResultIndex(resultIndex);
          } else {
            // Initialiser à 0 si pas encore défini (seulement si admin)
            if (isAdmin) {
              await updateDoc(sessionRef, { currentResultIndex: 0 });
              setCurrentResultIndex(0);
            }
            console.log('⏳ En attente du chargement des questions pour afficher les résultats...');
          }
        }
        return;
      }

      // Charger les questions depuis le sondage associé si nécessaire
      if (questions.length === 0 && data.surveyId) {
        console.log('📥 Chargement des questions depuis le sondage:', data.surveyId);
        const loadedQuestions = await loadQuestionsFromSurvey(sid);
        // Si les questions sont chargées, traiter l'index de question actuel avec les questions chargées
        if (loadedQuestions && loadedQuestions.length > 0) {
          // Vérifier si la session est terminée
          const currentIndex = data.currentQuestionIndex ?? -1;
          const isFinished = currentIndex >= loadedQuestions.length;
          
          if (isFinished && !isSpectator) {
            // La session vient de se terminer, passer en mode spectateur et mode résultats
            setIsSpectator(true);
            setShowResults(true);
            await loadFinalResults(sid);
            // S'assurer que la session est en mode résultats si ce n'est pas déjà le cas
            if (!data.resultsMode) {
              await updateDoc(sessionRef, {
                resultsMode: true,
                currentResultIndex: 0,
              });
            }
            return;
          }
          
          await handleQuestionIndex(data.currentQuestionIndex, data, sid, loadedQuestions);
        }
        return;
      }
      
      // Vérifier si la session est terminée
      const currentIndex = data.currentQuestionIndex ?? -1;
      if (questions.length > 0 && currentIndex >= questions.length && !isSpectator && !isResultsMode) {
        setIsSpectator(true);
        setShowResults(true);
        await loadFinalResults(sid);
        // S'assurer que la session est en mode résultats si ce n'est pas déjà le cas
        const sessionRef = doc(db, 'sessions', sid);
        const sessionDoc = await getDoc(sessionRef);
        if (sessionDoc.exists() && !sessionDoc.data()?.resultsMode) {
          await updateDoc(sessionRef, {
            resultsMode: true,
            currentResultIndex: 0,
          });
        }
        return;
      }
      
      await handleQuestionIndex(data.currentQuestionIndex, data, sid);
      
      // Gérer le timer depuis Firestore pour tous les utilisateurs
      // Nettoyer l'intervalle précédent s'il existe
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      if (data.questionTimerEndTime && !isResultsMode) {
        // Convertir questionTimerEndTime en nombre (gérer les cas où Firestore le stocke comme Timestamp)
        let timerEndTime: number;
        if (typeof data.questionTimerEndTime === 'number') {
          timerEndTime = data.questionTimerEndTime;
        } else if (data.questionTimerEndTime && typeof data.questionTimerEndTime.toMillis === 'function') {
          // C'est un Timestamp Firestore
          timerEndTime = data.questionTimerEndTime.toMillis();
        } else if (data.questionTimerEndTime && typeof data.questionTimerEndTime.toDate === 'function') {
          // C'est un Timestamp Firestore (autre format)
          timerEndTime = data.questionTimerEndTime.toDate().getTime();
        } else {
          // Fallback : essayer de convertir en nombre
          timerEndTime = Number(data.questionTimerEndTime);
        }
        
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
        if (remaining > 0 && !isNaN(remaining)) {
          setQuestionTimer(remaining);
          // Mettre à jour le timer toutes les 100ms pour un affichage fluide
          timerIntervalRef.current = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
            if (remaining > 0 && !isNaN(remaining)) {
              setQuestionTimer(remaining);
            } else {
              setQuestionTimer(null);
              if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
              }
            }
          }, 100);
          // Nettoyer l'intervalle après 12 secondes au cas où
          setTimeout(() => {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
          }, 12000);
        } else {
          setQuestionTimer(null);
        }
      } else {
        setQuestionTimer(null);
      }
    }, (error) => {
      console.error('❌ Erreur lors de l\'écoute de la session:', error);
    });

    // Écouter les participants
    if (!sid || typeof sid !== 'string' || sid.trim() === '') {
      console.error('❌ ID de session invalide pour les participants:', sid);
      return;
    }

    const participantsRef = collection(db, 'sessions', sid, 'participants');
    console.log('👂 Écoute des participants pour la session:', sid);
    onSnapshot(participantsRef, (snapshot) => {
      console.log('📊 Participants mis à jour:', snapshot.size, 'participant(s)');
      const parts: any[] = [];
      snapshot.forEach((doc) => {
        console.log('  - Participant:', doc.id, doc.data());
        parts.push({ id: doc.id, ...doc.data() });
      });
      setParticipants(parts);
      console.log('✅ Liste des participants mise à jour:', parts.map(p => p.id));
    }, (error) => {
      console.error('❌ Erreur lors de l\'écoute des participants:', error);
    });
  }, [name, loadFinalResults, loadQuestionsFromSurvey, isAdmin, isSpectator, questions, results.length]);

  // Calculer les statistiques (mémorisé)
  const questionStats = useMemo(() => {
    if (!showResults) return [];
    return calculateQuestionStats();
  }, [showResults, calculateQuestionStats]);

  // Détecter le gagnant et déclencher l'animation pour les questions multiple-choice, ranking et pairing
  useEffect(() => {
    if (!showResults || !resultsMode || currentResultIndex < 0 || !questionStats || questionStats.length === 0) {
      return;
    }

    // Ne pas déclencher l'animation si elle est déjà en cours
    if (showRevealAnimation) {
      return;
    }

    // Ne pas déclencher l'animation si on a déjà animé ce résultat
    if (lastAnimatedResultIndex === currentResultIndex) {
      return;
    }

    const currentStat = questionStats[currentResultIndex];
    if (!currentStat) {
      return;
    }

    let winnerName = '';
    let winnerImage: string | undefined = undefined;
    let winnerImage2: string | undefined = undefined; // Pour les couples

    if (currentStat.type === 'multiple-choice') {
      // Trouver le gagnant (option avec le plus de votes)
      const sortedOptions = Object.keys(currentStat.votes)
        .map(optIdx => parseInt(optIdx))
        .sort((a, b) => {
          const votesA = currentStat.votes[a] || 0;
          const votesB = currentStat.votes[b] || 0;
          return votesB - votesA;
        });

      if (sortedOptions.length === 0) {
        return;
      }

      const winnerIndex = sortedOptions[0];
      const winnerVotes = currentStat.votes[winnerIndex] || 0;
      
      // Vérifier s'il y a un gagnant unique (pas d'égalité)
      const secondPlaceVotes = sortedOptions.length > 1 ? (currentStat.votes[sortedOptions[1]] || 0) : 0;
      
      if (winnerVotes > secondPlaceVotes && winnerVotes > 0) {
        const winnerOption = currentStat.options[winnerIndex];
        winnerName = getOptionText(winnerOption);
        winnerImage = getOptionImage(winnerOption);
      }
    } else if (currentStat.type === 'ranking') {
      // Trouver le meilleur classé (première position moyenne)
      if (currentStat.rankingAverages && Object.keys(currentStat.rankingAverages).length > 0) {
        const sortedOptions = Object.keys(currentStat.rankingAverages)
          .map(optIdx => parseInt(optIdx))
          .sort((a, b) => {
            const avgA = currentStat.rankingAverages[a]?.average ?? Infinity;
            const avgB = currentStat.rankingAverages[b]?.average ?? Infinity;
            return avgA - avgB;
          });

        if (sortedOptions.length > 0) {
          const winnerIndex = sortedOptions[0];
          const avgData = currentStat.rankingAverages[winnerIndex];
          if (avgData && avgData.count > 0) {
            const winnerOption = currentStat.options[winnerIndex];
            winnerName = getOptionText(winnerOption);
            winnerImage = getOptionImage(winnerOption);
          }
        }
      }
    } else if (currentStat.type === 'pairing') {
      // Trouver le meilleur couple
      if (currentStat.coupleVotes && Object.keys(currentStat.coupleVotes).length > 0) {
        const sortedCouples = Object.entries(currentStat.coupleVotes)
          .map(([key, votes]) => [key, votes as number] as [string, number])
          .sort(([, votesA], [, votesB]) => votesB - votesA);

        if (sortedCouples.length > 0) {
          const [coupleKey, votes] = sortedCouples[0];
          if (votes > 0) {
            const [firstIdx, secondIdx] = coupleKey.split(',').map(Number);
            const firstOption = currentStat.options[firstIdx];
            const secondOption = currentStat.options[secondIdx];
            winnerName = `${getOptionText(firstOption)} & ${getOptionText(secondOption)}`;
            winnerImage = getOptionImage(firstOption);
            winnerImage2 = getOptionImage(secondOption);
          }
        }
      }
    }

    // Vérifier qu'on a un gagnant et que l'index n'a pas changé entre-temps
    if (winnerName && currentResultIndex >= 0 && currentResultIndex < questionStats.length) {
      // Double vérification : s'assurer que le résultat correspond toujours
      const verifyStat = questionStats[currentResultIndex];
      if (verifyStat && verifyStat.question === currentStat.question) {
        // Déclencher l'animation pour ce nouveau résultat
        setRevealAnimationData({
          question: currentStat.question,
          winnerName,
          winnerImage,
          winnerImage2,
          allOptions: undefined, // Ne pas passer toutes les options, seulement le gagnant
        });
        setShowRevealAnimation(true);
        setLastAnimatedResultIndex(currentResultIndex);
      }
    }
  }, [showResults, resultsMode, currentResultIndex, questionStats, showRevealAnimation, lastAnimatedResultIndex]);

  // Annuler l'animation si le résultat change pendant qu'elle est en cours
  useEffect(() => {
    if (showRevealAnimation && revealAnimationData) {
      // Vérifier que l'animation correspond toujours au résultat actuel
      if (lastAnimatedResultIndex !== currentResultIndex) {
        console.log('⚠️ Résultat changé pendant l\'animation, annulation de l\'animation');
        setShowRevealAnimation(false);
        setRevealAnimationData(null);
      }
    }
  }, [currentResultIndex, showRevealAnimation, revealAnimationData, lastAnimatedResultIndex]);

  // Fonction pour passer au résultat suivant (admin seulement)
  const handleNextResult = async () => {
    if (!sessionId || !isAdmin || !resultsMode) return;
    
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        showAlert('Erreur', 'Session introuvable');
        return;
      }
      
      const currentResultIdx = sessionDoc.data()?.currentResultIndex ?? 0;
      const nextResultIdx = currentResultIdx + 1;
      
      if (nextResultIdx >= questions.length) {
        // Tous les résultats ont été affichés
        showAlert('Information', 'Tous les résultats ont été affichés !');
        return;
      }
      
      // Réinitialiser complètement l'animation pour qu'elle se rejoue pour le nouveau résultat
      setShowRevealAnimation(false);
      setRevealAnimationData(null);
      setLastAnimatedResultIndex(-1); // Réinitialiser pour permettre l'animation du nouveau résultat
      
      // Attendre un peu pour que React nettoie complètement le composant précédent
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await updateDoc(sessionRef, {
        currentResultIndex: nextResultIdx,
      });
      console.log('✅ Passage au résultat suivant:', nextResultIdx);
    } catch (error) {
      console.error('Erreur lors du passage au résultat suivant:', error);
      showAlert('Erreur', 'Erreur lors du passage au résultat suivant');
    }
  };

  // Fonction pour revenir au résultat précédent (admin seulement)
  const handlePreviousResult = async () => {
    if (!sessionId || !isAdmin || !resultsMode) return;
    
    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        showAlert('Erreur', 'Session introuvable');
        return;
      }
      
      const currentResultIdx = sessionDoc.data()?.currentResultIndex ?? 0;
      const previousResultIdx = currentResultIdx - 1;
      
      if (previousResultIdx < 0) {
        // On est déjà au premier résultat
        showAlert('Information', 'Vous êtes déjà au premier résultat !');
        return;
      }
      
      // Réinitialiser complètement l'animation pour qu'elle se rejoue pour le résultat précédent
      setShowRevealAnimation(false);
      setRevealAnimationData(null);
      setLastAnimatedResultIndex(-1); // Réinitialiser pour permettre l'animation du résultat précédent
      
      // Attendre un peu pour que React nettoie complètement le composant précédent
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await updateDoc(sessionRef, {
        currentResultIndex: previousResultIdx,
      });
      console.log('✅ Retour au résultat précédent:', previousResultIdx);
    } catch (error) {
      console.error('Erreur lors du retour au résultat précédent:', error);
      showAlert('Erreur', 'Erreur lors du retour au résultat précédent');
    }
  };

  // Soumettre une réponse
  const handleSubmitAnswer = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/56000035-2b1e-4b09-8741-9c55323fd7ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:1530',message:'handleSubmitAnswer appelée',data:{hasSessionId:!!sessionId,hasCurrentQuestion:!!currentQuestion,questionType:currentQuestion?.type,isSpectator},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!sessionId || !currentQuestion) return;
    
    // Empêcher la soumission si on est en mode spectateur
    if (isSpectator) {
      alert('Vous êtes en mode spectateur. Vous ne pouvez pas répondre aux questions.');
      return;
    }
    
    // Vérifier selon le type de question
    if (currentQuestion.type === 'ranking') {
      if (rankingOrder.length === 0 || rankingOrder.length !== currentQuestion.options.length) {
        alert('Veuillez classer toutes les options');
        return;
      }
      // Vérifier que tous les index de 0 à options.length-1 sont présents exactement une fois
      const sortedOrder = [...rankingOrder].sort((a, b) => a - b);
      const expectedIndices = currentQuestion.options.map((_: any, index: number) => index);
      const isValidOrder = sortedOrder.every((val, idx) => val === expectedIndices[idx]);
      if (!isValidOrder) {
        console.error('❌ Erreur: rankingOrder invalide - index manquants ou dupliqués', {
          rankingOrder,
          sortedOrder,
          expectedIndices,
          questionIndex: currentQuestionIndex
        });
        alert('Erreur: Le classement contient des options manquantes ou dupliquées. Veuillez rafraîchir la page et réessayer.');
        return;
      }
    } else if (currentQuestion.type === 'pairing') {
      // Pour pairing, on doit avoir créé au moins un couple
      // On vérifie que toutes les personnes sont associées (ou presque, si impair)
      const usedIndices = new Set<number>();
      pairingSelection.forEach(([a, b]) => {
        usedIndices.add(a);
        usedIndices.add(b);
      });
      // On accepte même si toutes les personnes ne sont pas associées (nombre impair)
      if (pairingSelection.length === 0) {
        alert('Veuillez créer au moins un couple en associant les personnes');
        return;
      }
      // Vérifier qu'on n'a pas de doublons dans les couples
      const seenCouples = new Set<string>();
      for (const [a, b] of pairingSelection) {
        const coupleKey = a < b ? `${a},${b}` : `${b},${a}`;
        if (seenCouples.has(coupleKey)) {
          alert('Vous avez créé un couple en double. Veuillez corriger.');
          return;
        }
        seenCouples.add(coupleKey);
        if (a === b) {
          alert('Un couple ne peut pas être formé de la même personne deux fois.');
          return;
        }
      }
    } else if (currentQuestion.type === 'categorization') {
      // Pour categorization, la validation se fait plus bas dans la fonction
      // On ne fait rien ici, on laisse passer pour atteindre la validation plus bas
    } else {
      if (selectedAnswer === null) return;
    }

    try {
      const participantRef = doc(
        db,
        'sessions',
        sessionId,
        'participants',
        name
      );
      const participantDoc = await getDoc(participantRef);
      const currentData = participantDoc.data();
      const answers = currentData?.answers || {};
      const currentScore = currentData?.score || 0;

      // Utiliser currentQuestionIndex au lieu de currentQuestion.id - 1 pour éviter les problèmes de synchronisation
      const questionIndex = currentQuestionIndex >= 0 ? currentQuestionIndex : (currentQuestion.id ? currentQuestion.id - 1 : -1);
      
      if (questionIndex < 0) {
        console.error('❌ Impossible de déterminer l\'index de la question');
        alert('Erreur : Impossible de déterminer la question actuelle. Veuillez rafraîchir la page.');
        return;
      }
      
      let answer: any;
      if (currentQuestion.type === 'categorization') {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/56000035-2b1e-4b09-8741-9c55323fd7ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:1613',message:'Validation categorization - AVANT',data:{optionsLength:currentQuestion.options?.length,optionsIsArray:Array.isArray(currentQuestion.options),categorizationAnswers,questionIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        // Vérifier que toutes les personnes ont été classées
        const allClassified = currentQuestion.options.every((_: any, index: number) => 
          categorizationAnswers[index] === 0 || categorizationAnswers[index] === 1
        );
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/56000035-2b1e-4b09-8741-9c55323fd7ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:1618',message:'Validation categorization - APRÈS',data:{allClassified,optionsLength:currentQuestion.options?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (!allClassified) {
          alert('Veuillez classer toutes les personnes dans l\'une des deux catégories');
          return;
        }
        answer = categorizationAnswers;
        console.log('💾 Sauvegarde réponse categorization:', {
          questionIndex,
          categorizationAnswers: answer,
          question: currentQuestion.question
        });
      } else if (currentQuestion.type === 'ranking') {
        // S'assurer que rankingOrder est un tableau valide avec toutes les options
        if (!Array.isArray(rankingOrder) || rankingOrder.length !== currentQuestion.options.length) {
          console.error('❌ Erreur: rankingOrder invalide lors de la soumission', {
            rankingOrder,
            optionsLength: currentQuestion.options.length,
            questionIndex
          });
          alert('Erreur: Le classement est invalide. Veuillez rafraîchir la page et réessayer.');
          return;
        }
        // Créer une copie pour s'assurer qu'on sauvegarde bien l'état actuel
        answer = [...rankingOrder];
        console.log('💾 Sauvegarde réponse ranking:', {
          questionIndex,
          rankingOrder: answer,
          question: currentQuestion.question
        });
      } else if (currentQuestion.type === 'pairing') {
        // Stocker tous les couples comme tableau plat [index1, index2, index3, index4, ...]
        // Firestore ne supporte pas les tableaux imbriqués, donc on utilise un tableau plat
        answer = pairingSelection.flatMap(([a, b]) => {
          return a < b ? [a, b] : [b, a];
        });
      } else {
        answer = selectedAnswer;
      }
      answers[questionIndex] = answer;

      // Pas de scoring pour les sondages
      let newScore = currentScore;

      await updateDoc(participantRef, {
        answers,
        score: newScore,
      });

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/56000035-2b1e-4b09-8741-9c55323fd7ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:1665',message:'Réponse sauvegardée avec succès',data:{questionIndex,questionType:currentQuestion.type,answerSaved:!!answers[questionIndex]},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      setHasAnswered(true);
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la soumission');
    }
  };

  // Admin: Lancer le sondage (commencer à la première question)
  const handleStartSurvey = async () => {
    if (!sessionId || !isAdmin) return;

    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        alert('Session introuvable');
        return;
      }

      const sessionData = sessionDoc.data();
      if (!sessionData?.surveyId) {
        alert('Aucun sondage associé à cette session. Associez d\'abord un sondage depuis le panneau admin.');
        return;
      }

      // Charger les questions si nécessaire
      let loadedQuestions = questions;
      if (questions.length === 0) {
        loadedQuestions = await loadQuestionsFromSurvey(sessionId) || [];
      }

      if (loadedQuestions.length === 0) {
        alert('Aucune question trouvée dans le sondage associé.');
        return;
      }

      // Démarrer le sondage (première question)
      await updateDoc(sessionRef, {
        currentQuestionIndex: 0,
        isActive: true,
      });
      
      alert('Sondage lancé ! La première question est maintenant affichée.');
    } catch (error) {
      console.error('Erreur lors du lancement:', error);
      alert('Erreur lors du lancement du sondage');
    }
  };

  // Admin: Passer directement aux résultats (pour la dernière question)
  const handleViewResults = async () => {
    if (!sessionId || !isAdmin) return;
    if (questionTimer !== null && questionTimer > 0) return; // Empêcher si timer actif

    try {
      // Valider que sessionId est valide
      if (typeof sessionId !== 'string' || sessionId.trim() === '') {
        console.error('❌ ID de session invalide:', sessionId);
        return;
      }

      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        console.error('❌ Session introuvable:', sessionId);
        alert('Session introuvable');
        return;
      }

      console.log('🏁 Passage en mode résultats');
      // Charger les résultats finaux avant de passer en mode résultats
      await loadFinalResults(sessionId);
      await updateDoc(sessionRef, {
        currentQuestionIndex: questions.length,
        resultsMode: true,
        currentResultIndex: 0, // Commencer par le premier résultat
      });
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors du passage aux résultats');
    }
  };

  // Admin: Passer à la question suivante avec délai de 10 secondes
  const handleNextQuestion = async () => {
    if (!sessionId || !isAdmin) return;
    if (questionTimer !== null && questionTimer > 0) return; // Empêcher si timer actif

    try {
      // Valider que sessionId est valide
      if (typeof sessionId !== 'string' || sessionId.trim() === '') {
        console.error('❌ ID de session invalide:', sessionId);
        return;
      }

      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        console.error('❌ Session introuvable:', sessionId);
        alert('Session introuvable');
        return;
      }

      const currentIndex = sessionDoc.data()?.currentQuestionIndex ?? -1;
      const nextIndex = currentIndex + 1;
      
      console.log('📊 État actuel:', {
        currentIndex,
        nextIndex,
        totalQuestions: questions.length,
        canGoNext: nextIndex < questions.length
      });

      if (nextIndex >= questions.length) {
        // Si c'est la dernière question, passer aux résultats
        await handleViewResults();
        return;
      }
      
      // Nettoyer l'intervalle précédent s'il existe
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      // Démarrer le timer de 10 secondes dans Firestore pour synchroniser tous les utilisateurs
      const timerDuration = 10; // secondes
      const timerEndTime = Date.now() + (timerDuration * 1000);
      console.log('⏱️ Démarrage du timer de 10 secondes avant la question suivante (index:', nextIndex, ')');
      
      // Stocker le timestamp de fin du timer dans Firestore
      await updateDoc(sessionRef, {
        questionTimerEndTime: timerEndTime,
      });
      
      // Timer local pour mettre à jour l'affichage en temps réel (sera aussi synchronisé via Firestore)
      let countdown = timerDuration;
      setQuestionTimer(countdown);
      
      timerIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
        countdown = remaining;
        setQuestionTimer(countdown > 0 ? countdown : null);
        
        if (countdown <= 0) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setQuestionTimer(null);
          
          // Changer la question après le délai
          console.log('✅ Timer terminé, passage à la question suivante (index:', nextIndex, ')');
          updateDoc(sessionRef, {
            currentQuestionIndex: nextIndex,
            questionTimerEndTime: null, // Réinitialiser le timer
          }).then(() => {
            console.log('✅ Question mise à jour avec succès dans Firestore');
            setQuestionTimer(null);
          }).catch((error) => {
            console.error('❌ Erreur lors du changement de question:', error);
            setQuestionTimer(null);
          });
        }
      }, 100);
    } catch (error) {
      console.error('❌ Erreur:', error);
      setQuestionTimer(null);
      // Réinitialiser le timer dans Firestore en cas d'erreur
      try {
        const sessionRef = doc(db, 'sessions', sessionId);
        await updateDoc(sessionRef, {
          questionTimerEndTime: null,
        });
      } catch (e) {
        console.error('Erreur lors de la réinitialisation du timer:', e);
      }
    }
  };

  // Fonction pour quitter la session
  const handleLeaveSession = async () => {
    if (!sessionId || !name) return;

    const confirmLeave = window.confirm('Êtes-vous sûr de vouloir quitter la session ?');
    if (!confirmLeave) return;

    // Nettoyer l'intervalle du timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    try {
      console.log('🚪 Début de la procédure de quitter la session');
      
      const participantRef = doc(db, 'sessions', sessionId, 'participants', name);
      const sessionRef = doc(db, 'sessions', sessionId);
      
      // Récupérer la liste actuelle des participants
      const participantsRef = collection(db, 'sessions', sessionId, 'participants');
      const participantsSnapshot = await getDocs(participantsRef);
      const allParticipants = participantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Si c'est l'admin qui quitte
      let participantAlreadyDeleted = false;
      if (isAdmin) {
        console.log('👑 L\'administrateur quitte la session');
        
        // Trouver un autre participant pour devenir admin
        const otherParticipants = allParticipants.filter(p => p.id !== name);
        
        if (otherParticipants.length > 0) {
          // Transférer l'admin au premier autre participant
          const newAdmin = otherParticipants[0];
          console.log('🔄 Transfert de l\'admin à:', newAdmin.id);
          
          await updateDoc(sessionRef, {
            adminName: newAdmin.id,
          });
          console.log('✅ Admin transféré avec succès');
        } else {
          // Plus de participants, supprimer la session complètement
          console.log('🗑️ Plus de participants, suppression complète de la session');
          
          // Utiliser la fonction de nettoyage complète
          await cleanupSession(sessionId);
          participantAlreadyDeleted = true; // Le participant a été supprimé dans cleanupSession
        }
      }

      // Supprimer le participant de Firestore (seulement s'il n'a pas déjà été supprimé)
      if (!participantAlreadyDeleted) {
        console.log('🗑️ Suppression du participant:', name);
        try {
          await deleteDoc(participantRef);
          console.log('✅ Participant supprimé de Firestore');
        } catch (deleteError: any) {
          // Si le participant n'existe plus (déjà supprimé), ce n'est pas grave
          if (deleteError?.code === 'not-found') {
            console.log('ℹ️ Participant déjà supprimé');
          } else {
            throw deleteError;
          }
        }
      } else {
        console.log('ℹ️ Participant déjà supprimé lors de la suppression de la session');
      }

      // Nettoyer le localStorage (toujours faire cela même en cas d'erreur)
      try {
        localStorage.removeItem('sessionId');
        localStorage.removeItem('participantName');
        localStorage.removeItem('isAdmin');
        console.log('✅ LocalStorage nettoyé');
      } catch (localStorageError) {
        console.error('⚠️ Erreur lors du nettoyage du localStorage:', localStorageError);
        // Continuer quand même, ce n'est pas critique
      }

      // Réinitialiser tous les états
      setSessionId('');
      setName('');
      setSessionIdInput('');
      setSessionIdFromUrl(false);
      setIsAdmin(false);
      setCurrentQuestion(null);
      setSelectedAnswer(null);
      setHasAnswered(false);
      setShowResults(false);
      setResults([]);
      setParticipants([]);
      setQuestionTimer(null);
      
      console.log('✅ Retour au menu principal');
    } catch (error) {
      console.error('❌ Erreur lors de la sortie:', error);
      
      // Nettoyer le localStorage même en cas d'erreur
      try {
        localStorage.removeItem('sessionId');
        localStorage.removeItem('participantName');
        localStorage.removeItem('isAdmin');
        console.log('✅ LocalStorage nettoyé (après erreur)');
      } catch (localStorageError) {
        console.error('⚠️ Erreur lors du nettoyage du localStorage:', localStorageError);
      }
      
      // Réinitialiser les états même en cas d'erreur
      setSessionId('');
      setName('');
      setSessionIdInput('');
      setSessionIdFromUrl(false);
      setIsAdmin(false);
      setCurrentQuestion(null);
      setSelectedAnswer(null);
      setHasAnswered(false);
      setShowResults(false);
      setResults([]);
      setParticipants([]);
      setQuestionTimer(null);
      
      alert('Erreur lors de la sortie: ' + (error as Error).message);
    }
  };

  // Fonction pour générer le lien de partage
  const getShareLink = useCallback((sid: string) => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}?sessionId=${sid}`;
  }, []);

  // Fonction pour copier le lien de partage
  const copyShareLink = useCallback(async (sid: string) => {
    const link = getShareLink(sid);
    try {
      await navigator.clipboard.writeText(link);
      alert('Lien de partage copié ! Vous pouvez maintenant l\'envoyer à d\'autres personnes.');
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
      // Fallback pour les navigateurs qui ne supportent pas clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        alert('Lien de partage copié !');
      } catch (err) {
        alert('Impossible de copier automatiquement. Voici le lien: ' + link);
      }
      document.body.removeChild(textArea);
    }
  }, [getShareLink]);

  // Vérifier si l'utilisateur est déjà connecté ou s'il y a un paramètre sessionId dans l'URL
  useEffect(() => {
    // Ne vérifier qu'une seule fois au chargement initial
    if (hasCheckedLocalStorage.current) {
      return;
    }
    hasCheckedLocalStorage.current = true;

    // Vérifier d'abord les paramètres d'URL côté client
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get('sessionId');
      if (urlSessionId) {
        // Pré-remplir l'ID de session depuis l'URL
        setSessionIdInput(urlSessionId);
        setSessionIdFromUrl(true); // Marquer que le sessionId vient de l'URL
        // Nettoyer l'URL pour éviter les problèmes
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    // Vérifier le localStorage seulement au chargement initial
    const savedSessionId = localStorage.getItem('sessionId');
    const savedName = localStorage.getItem('participantName');
    const savedIsAdmin = localStorage.getItem('isAdmin') === 'true';

    if (savedSessionId && savedName) {
      // Se reconnecter automatiquement seulement si on a des données sauvegardées
      setSessionId(savedSessionId);
      setName(savedName);
      setIsAdmin(savedIsAdmin);
      listenToSession(savedSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Tableau de dépendances vide pour ne s'exécuter qu'une seule fois au montage

  // Nettoyer le timer quand le composant est démonté
  useEffect(() => {
    return () => {
      setQuestionTimer(null);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, []);

  // Activer le contexte audio pour iOS lors de la première interaction utilisateur
  useEffect(() => {
    if (audioContextActivatedRef.current) {
      return;
    }

    const activateAudio = async () => {
      try {
        // Créer un audio silencieux pour débloquer le contexte audio
        const silentAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE=');
        silentAudio.volume = 0.01;
        silentAudio.preload = 'auto';
        
        const playAndPause = async () => {
          try {
            await silentAudio.play();
            await silentAudio.pause();
            silentAudio.currentTime = 0;
            audioContextActivatedRef.current = true;
            console.log('✅ Contexte audio activé pour iOS');
          } catch (e) {
            // Ignorer les erreurs silencieusement
          }
        };

        // Écouter les événements de clic et de toucher pour activer l'audio
        const events = ['click', 'touchstart', 'touchend', 'keydown'];
        const handleInteraction = async () => {
          if (!audioContextActivatedRef.current) {
            await playAndPause();
            // Retirer les listeners après activation
            events.forEach(event => {
              document.removeEventListener(event, handleInteraction);
            });
          }
        };

        events.forEach(event => {
          document.addEventListener(event, handleInteraction, { once: true, passive: true });
        });
      } catch (e) {
        console.warn('⚠️ Erreur lors de l\'activation du contexte audio:', e);
      }
    };

    activateAudio();
  }, []);

  // Écran de connexion
  if (!sessionId) {
    return (
      <div className="container">
        <h1>📊 Beihang Sondage</h1>
        {sessionIdFromUrl && (
          <div style={{ 
            marginBottom: '20px', 
            padding: '15px', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            borderRadius: '10px',
            fontSize: '16px',
            color: 'white',
            textAlign: 'center'
          }}>
            ✨ Vous avez été invité à rejoindre une session !
          </div>
        )}
        <div>
          <input
            type="text"
            placeholder="Votre prénom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            autoFocus={sessionIdFromUrl}
          />
          <input
            type="text"
            placeholder="ID de session (obligatoire)"
            value={sessionIdInput}
            onChange={(e) => {
              setSessionIdInput(e.target.value);
              // Si l'utilisateur modifie le champ, ce n'est plus depuis l'URL
              if (sessionIdFromUrl) {
                setSessionIdFromUrl(false);
              }
            }}
            className="input"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            readOnly={sessionIdFromUrl}
            style={sessionIdFromUrl ? { background: '#f5f5f5', cursor: 'not-allowed' } : {}}
            required
          />
          <button onClick={handleJoin} className="button">
            Rejoindre la session
          </button>
          {sessionIdInput.trim() && (
            <div style={{ 
              marginTop: '10px', 
              padding: '10px', 
              background: '#e3f2fd', 
              borderRadius: '5px',
              fontSize: '14px',
              color: '#1976d2'
            }}>
              💡 Vous allez rejoindre la session: <strong>{sessionIdInput.trim()}</strong>
            </div>
          )}
          {!sessionIdInput.trim() && (
            <div style={{ 
              marginTop: '10px', 
              padding: '10px', 
              background: '#fff3cd', 
              borderRadius: '5px',
              fontSize: '14px',
              color: '#856404'
            }}>
              ⚠️ Les sessions doivent être créées depuis le panneau administrateur.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Écran de résultats finaux
  if (showResults) {
    // Afficher l'animation de révélation si nécessaire
    // Vérifier que l'animation correspond bien au résultat actuel
    if (showRevealAnimation && revealAnimationData && lastAnimatedResultIndex === currentResultIndex) {
      return (
        <RevealAnimation
          key={`reveal-${currentResultIndex}-${revealAnimationData.winnerName}`} // Clé unique pour forcer le remontage complet
          question={revealAnimationData.question}
          winnerName={revealAnimationData.winnerName}
          winnerImage={revealAnimationData.winnerImage}
          winnerImage2={revealAnimationData.winnerImage2}
          allOptions={revealAnimationData.allOptions}
          onComplete={() => {
            setShowRevealAnimation(false);
            setRevealAnimationData(null);
            // Ne pas réinitialiser lastAnimatedResultIndex ici car on veut éviter de relancer l'animation pour ce résultat
          }}
        />
      );
    }

    // Si on est en mode résultats (un par un), n'afficher que le résultat actuel
    if (resultsMode && currentResultIndex >= 0 && currentResultIndex < questions.length) {
      const currentStat = questionStats && Array.isArray(questionStats) 
        ? questionStats[currentResultIndex] 
        : null;
      
      return (
        <div className="container">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px',
            paddingBottom: '20px',
            borderBottom: '2px solid #e0e0e0'
          }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '28px', color: '#333' }}>
                📊 Résultats - Question {currentResultIndex + 1} / {questions.length}
              </h1>
              {currentStat && (
                <p style={{ marginTop: '10px', color: '#666', fontSize: '16px' }}>
                  {currentStat.question}
                </p>
              )}
            </div>
            {isAdmin && (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'row',
                gap: '10px', 
                alignItems: 'center',
                flexWrap: 'wrap',
                width: '100%'
              }}>
                <button
                  onClick={handlePreviousResult}
                  disabled={currentResultIndex <= 0}
                  className="button"
                  style={{
                    background: currentResultIndex <= 0
                      ? '#ccc'
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    cursor: currentResultIndex <= 0 ? 'not-allowed' : 'pointer',
                    fontSize: 'clamp(14px, 4vw, 16px)',
                    padding: 'clamp(12px, 3vw, 15px) clamp(20px, 5vw, 30px)',
                    fontWeight: '600',
                    flex: '1 1 auto',
                    minWidth: '140px',
                    whiteSpace: 'nowrap',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    borderRadius: '8px',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  ⬅️ Résultat précédent
                </button>
                <button
                  onClick={handleNextResult}
                  disabled={currentResultIndex >= questions.length - 1}
                  className="button"
                  style={{
                    background: currentResultIndex >= questions.length - 1
                      ? '#ccc'
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    cursor: currentResultIndex >= questions.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: 'clamp(14px, 4vw, 16px)',
                    padding: 'clamp(12px, 3vw, 15px) clamp(20px, 5vw, 30px)',
                    fontWeight: '600',
                    flex: '1 1 auto',
                    minWidth: '140px',
                    whiteSpace: 'nowrap',
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    borderRadius: '8px',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  {currentResultIndex >= questions.length - 1 ? '✅ Dernier résultat' : '➡️ Résultat suivant'}
                </button>
              </div>
            )}
          </div>

          {currentStat ? (
            <div style={{
              background: '#f9f9f9',
              padding: '30px',
              borderRadius: '15px',
              border: '1px solid #e0e0e0',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
            }}>
              {currentStat.type === 'ranking' ? (
                <div>
                  <p style={{ color: '#666', marginBottom: '20px', fontSize: '16px', fontWeight: '600' }}>
                    Réponses reçues: {currentStat.totalVotes}
                  </p>
                  {currentStat.options && Array.isArray(currentStat.options) && currentStat.options.length > 0 ? (
                    <div>
                      {currentStat.options
                        .map((option: string | Option, optIndex: number) => ({ option, optIndex }))
                        .map(({ optIndex }: { option: string | Option; optIndex: number }) => optIndex)
                        .sort((a: number, b: number) => {
                          const avgA = currentStat.rankingAverages?.[a]?.average ?? (currentStat.options.length);
                          const avgB = currentStat.rankingAverages?.[b]?.average ?? (currentStat.options.length);
                          return avgA - avgB;
                        })
                        .map((optionIndex: number, rankIndex: number) => {
                          const avgData = currentStat.rankingAverages?.[optionIndex];
                          const averagePosition = avgData?.average ?? (currentStat.options.length - 1);
                          const displayedPosition = averagePosition + 1;
                          const count = avgData?.count ?? 0;
                          const option = currentStat.options[optionIndex];
                          const optionText = getOptionText(option);
                          const isFirst = rankIndex === 0 && count > 0;
                          const hasNoVotes = count === 0;
                          const totalOptions = currentStat.options.length;
                          const funnyComment = getFunnyComment(rankIndex, totalOptions, count, count, 'ranking');
                            
                            return (
                              <div key={optionIndex} style={{ 
                                marginBottom: '15px',
                                padding: isFirst ? '20px' : '15px',
                                background: isFirst ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                                borderRadius: '8px',
                                border: isFirst ? 'none' : '1px solid #e0e0e0',
                                boxShadow: isFirst ? '0 4px 12px rgba(102, 126, 234, 0.4)' : '0 2px 4px rgba(0,0,0,0.05)',
                                transform: isFirst ? 'scale(1.02)' : 'none',
                                transition: 'all 0.3s ease'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ 
                                      fontWeight: isFirst ? '600' : '500', 
                                      fontSize: isFirst ? '16px' : '15px', 
                                      color: isFirst ? 'white' : '#333' 
                                    }}>
                                      {isFirst && <span style={{ marginRight: '8px' }}>🏆</span>}
                                      {rankIndex + 1}. {optionText}
                                    </span>
                                  </div>
                                  <div style={{ textAlign: 'right', marginLeft: '20px' }}>
                                    <div style={{ 
                                      fontWeight: '600', 
                                      color: isFirst ? 'white' : '#667eea', 
                                      fontSize: isFirst ? '22px' : '18px' 
                                    }}>
                                      {displayedPosition.toFixed(2)}
                                    </div>
                                    <div style={{ 
                                      fontSize: '11px', 
                                      color: isFirst ? 'rgba(255,255,255,0.9)' : '#999', 
                                      marginTop: '2px' 
                                    }}>
                                      position moyenne
                                    </div>
                                    {hasNoVotes ? (
                                      <div style={{ 
                                        fontSize: '11px', 
                                        color: '#999', 
                                        marginTop: '4px' 
                                      }}>
                                        (0 réponse)
                                      </div>
                                    ) : (
                                      <div style={{ 
                                        fontSize: '11px', 
                                        color: isFirst ? 'rgba(255,255,255,0.8)' : '#999', 
                                        marginTop: '4px' 
                                      }}>
                                        ({count} réponse{count !== 1 ? 's' : ''})
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Barre de progression visuelle pour la position */}
                                {!hasNoVotes && (
                                  <div style={{
                                    marginTop: '12px',
                                    width: '100%',
                                    height: '30px',
                                    background: isFirst ? 'rgba(255,255,255,0.2)' : '#e0e0e0',
                                    borderRadius: '15px',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    boxShadow: isFirst ? 'inset 0 2px 4px rgba(0,0,0,0.1)' : 'inset 0 2px 4px rgba(0,0,0,0.1)'
                                  }}>
                                    <div
                                      style={{
                                        width: `${((totalOptions - averagePosition) / totalOptions) * 100}%`,
                                        height: '100%',
                                        background: isFirst 
                                          ? 'rgba(255,255,255,0.4)' 
                                          : 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                                        transition: 'width 0.8s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-end',
                                        paddingRight: '10px',
                                        color: isFirst ? 'white' : 'white',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                      }}
                                    >
                                      {averagePosition < totalOptions * 0.3 && (
                                        <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                          Top tier !
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Commentaire drôle */}
                                {!hasNoVotes && (
                                  <div style={{
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    color: isFirst ? 'rgba(255,255,255,0.95)' : '#666',
                                    fontStyle: 'italic',
                                    paddingTop: '8px',
                                    borderTop: isFirst ? '1px solid rgba(255,255,255,0.3)' : '1px solid #f0f0f0'
                                  }}>
                                    {funnyComment}
                                  </div>
                                )}
                                {hasNoVotes && (
                                  <div style={{
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    color: '#999',
                                    fontStyle: 'italic',
                                    paddingTop: '8px',
                                    borderTop: '1px solid #f0f0f0'
                                  }}>
                                    ⚪ Aucune réponse reçue
                                  </div>
                                )}
                              </div>
                            );
                          })
                      }
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                      Aucune option disponible.
                    </div>
                  )}
                </div>
              ) : currentStat.type === 'pairing' ? (
                <div>
                  <p style={{ color: '#666', marginBottom: '20px', fontSize: '16px', fontWeight: '600' }}>
                    Réponses reçues: {currentStat.totalVotes}
                  </p>
                  {currentStat.coupleVotes && Object.keys(currentStat.coupleVotes).length > 0 ? (
                    <div>
                      {Object.entries(currentStat.coupleVotes)
                        .map(([coupleKey, votes]: [string, any]) => {
                          const [firstIndex, secondIndex] = coupleKey.split(',').map(Number);
                          return {
                            coupleKey,
                            firstIndex,
                            secondIndex,
                            votes: votes as number
                          };
                        })
                        .sort((a, b) => b.votes - a.votes)
                        .map((couple, rankIndex) => {
                          const firstOption = currentStat.options[couple.firstIndex];
                          const secondOption = currentStat.options[couple.secondIndex];
                          const firstText = getOptionText(firstOption);
                          const secondText = getOptionText(secondOption);
                          const isTopThree = rankIndex < 3;
                          const percentage = currentStat.totalVotes > 0 ? (couple.votes / currentStat.totalVotes) * 100 : 0;
                          const maxVotes = Math.max(...Object.values(currentStat.coupleVotes).map((v: any) => v as number));
                          const totalCouples = Object.keys(currentStat.coupleVotes).length;
                          const funnyComment = getFunnyComment(rankIndex, totalCouples, couple.votes, maxVotes, 'pairing');
                          
                          const getRankColor = (rank: number) => {
                            if (rank === 0) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
                            if (rank === 1) return 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)';
                            if (rank === 2) return 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)';
                            return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                          };
                          
                          const getRankEmoji = (rank: number) => {
                            if (rank === 0) return '🥇';
                            if (rank === 1) return '🥈';
                            if (rank === 2) return '🥉';
                            return `${rank + 1}.`;
                          };
                          
                          return (
                            <div 
                              key={couple.coupleKey} 
                              style={{ 
                                marginBottom: isTopThree ? '20px' : '15px',
                                padding: isTopThree ? '18px' : '15px',
                                background: isTopThree ? '#f9f9f9' : 'white',
                                borderRadius: '12px',
                                border: isTopThree ? `3px solid ${rankIndex === 0 ? '#FFD700' : rankIndex === 1 ? '#C0C0C0' : '#CD7F32'}` : '1px solid #e0e0e0',
                                boxShadow: isTopThree ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
                              }}
                            >
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                  <span style={{ 
                                    fontSize: isTopThree ? '24px' : '18px',
                                    fontWeight: '600',
                                    minWidth: '35px',
                                    textAlign: 'center'
                                  }}>
                                    {getRankEmoji(rankIndex)}
                                  </span>
                                  <span style={{ 
                                    fontWeight: isTopThree ? '600' : '500',
                                    fontSize: isTopThree ? '16px' : '15px',
                                    color: '#333'
                                  }}>
                                    {firstText} & {secondText}
                                  </span>
                                </div>
                                <div style={{ 
                                  textAlign: 'right',
                                  marginLeft: '15px'
                                }}>
                                  <div style={{ 
                                    fontWeight: '700', 
                                    color: isTopThree ? '#667eea' : '#555',
                                    fontSize: isTopThree ? '20px' : '18px'
                                  }}>
                                    {couple.votes} vote{couple.votes !== 1 ? 's' : ''}
                                  </div>
                                  <div style={{ 
                                    fontSize: '14px',
                                    color: '#999',
                                    marginTop: '2px'
                                  }}>
                                    {percentage.toFixed(1)}%
                                  </div>
                                </div>
                              </div>

                              <div style={{
                                width: '100%',
                                height: isTopThree ? '40px' : '35px',
                                background: '#e0e0e0',
                                borderRadius: '20px',
                                overflow: 'hidden',
                                position: 'relative',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                                marginBottom: '10px'
                              }}>
                                <div
                                  style={{
                                    width: `${percentage}%`,
                                    height: '100%',
                                    background: getRankColor(rankIndex),
                                    transition: 'width 0.8s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: percentage > 8 ? '15px' : '5px',
                                    color: 'white',
                                    fontSize: isTopThree ? '14px' : '12px',
                                    fontWeight: '700',
                                    boxShadow: isTopThree ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                                  }}
                                >
                                  {percentage > 8 && (
                                    <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                      {percentage.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Commentaire drôle */}
                              <div style={{
                                fontSize: '13px',
                                color: isTopThree ? '#555' : '#888',
                                fontStyle: 'italic',
                                paddingTop: '8px',
                                borderTop: '1px solid #f0f0f0',
                                textAlign: 'left'
                              }}>
                                {funnyComment}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                      Aucun couple n&apos;a été sélectionné.
                    </div>
                  )}
                </div>
              ) : currentStat.type === 'categorization' ? (
                <div>
                  <p style={{ color: '#666', marginBottom: '20px', fontSize: '16px', fontWeight: '600' }}>
                    Réponses reçues: {currentStat.totalVotes}
                  </p>
                  {currentStat.personCategories && currentStat.options && Array.isArray(currentStat.options) && currentStat.options.length > 0 ? (
                    <div>
                      {currentStat.options.map((option: string | Option, personIndex: number) => {
                        const categoryData = currentStat.personCategories[personIndex];
                        if (!categoryData) return null;
                        
                        const totalVotes = categoryData.categoryA + categoryData.categoryB;
                        const isMoreA = categoryData.categoryA > categoryData.categoryB;
                        const isMoreB = categoryData.categoryB > categoryData.categoryA;
                        const isEqual = categoryData.categoryA === categoryData.categoryB;
                        const question = questions[currentResultIndex];
                        const categoryA = question?.categoryA || 'Catégorie A';
                        const categoryB = question?.categoryB || 'Catégorie B';
                        const percentageA = totalVotes > 0 ? (categoryData.categoryA / totalVotes) * 100 : 0;
                        const percentageB = totalVotes > 0 ? (categoryData.categoryB / totalVotes) * 100 : 0;
                        
                        return (
                          <div
                            key={personIndex}
                            style={{
                              marginBottom: '15px',
                              padding: '15px',
                              background: isMoreA ? '#e3f2fd' : isMoreB ? '#fff3e0' : '#f5f5f5',
                              borderRadius: '8px',
                              border: isMoreA ? '2px solid #2196f3' : isMoreB ? '2px solid #ff9800' : '2px solid #e0e0e0'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <div style={{ fontWeight: '600', fontSize: '16px', color: '#333' }}>
                                {getOptionText(option)}
                              </div>
                              <div style={{ fontSize: '14px', color: '#666' }}>
                                {totalVotes} réponse{totalVotes !== 1 ? 's' : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                              <div style={{ flex: 1, padding: '10px', background: '#e3f2fd', borderRadius: '6px', textAlign: 'center' }}>
                                <div style={{ fontWeight: '600', color: '#1976d2', marginBottom: '5px' }}>
                                  {categoryA}
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1976d2' }}>
                                  {categoryData.categoryA}
                                </div>
                                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                  ({percentageA.toFixed(1)}%)
                                </div>
                              </div>
                              <div style={{ flex: 1, padding: '10px', background: '#fff3e0', borderRadius: '6px', textAlign: 'center' }}>
                                <div style={{ fontWeight: '600', color: '#f57c00', marginBottom: '5px' }}>
                                  {categoryB}
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#f57c00' }}>
                                  {categoryData.categoryB}
                                </div>
                                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                  ({percentageB.toFixed(1)}%)
                                </div>
                              </div>
                            </div>
                            {totalVotes > 0 && (
                              <div style={{ 
                                marginTop: '10px', 
                                padding: '8px', 
                                background: isMoreA ? '#2196f3' : isMoreB ? '#ff9800' : '#9e9e9e',
                                borderRadius: '6px',
                                color: 'white',
                                textAlign: 'center',
                                fontWeight: '600',
                                fontSize: '14px'
                              }}>
                                {isEqual 
                                  ? `Égalité entre ${categoryA} et ${categoryB}`
                                  : `Plus classé dans ${isMoreA ? categoryA : categoryB}`
                                }
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                      Aucune réponse disponible.
                    </div>
                  )}
                </div>
              ) : (
                (() => {
                  const displayStyle = getDisplayStyle(currentResultIndex);
                  const sortedOptions = currentStat.options && Array.isArray(currentStat.options)
                    ? currentStat.options
                        .map((option: string | Option, optIndex: number) => ({ option, optIndex }))
                        .map(({ optIndex }: { option: string | Option; optIndex: number }) => optIndex)
                        .sort((a: number, b: number) => {
                          const votesA = currentStat.votes[a] || 0;
                          const votesB = currentStat.votes[b] || 0;
                          return votesB - votesA;
                        })
                        .map((optionIndex: number, rank: number) => {
                          const votes = currentStat.votes[optionIndex] || 0;
                          const percentage = currentStat.totalVotes > 0 ? (votes / currentStat.totalVotes) * 100 : 0;
                          const option = currentStat.options[optionIndex];
                          const optionText = getOptionText(option);
                          const maxVotes = Math.max(...Object.values(currentStat.votes) as number[]);
                          const funnyComment = getFunnyComment(rank, currentStat.options.length, votes, maxVotes, 'multiple-choice');
                          return { optionIndex, rank, votes, percentage, optionText, funnyComment };
                        })
                    : [];

                  // Style PODIUM
                  if (displayStyle === 'podium' && sortedOptions.length >= 3) {
                    const topThree = sortedOptions.slice(0, 3);
                    const rest = sortedOptions.slice(3);
                    
                    return (
                      <div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '20px',
                          paddingBottom: '15px',
                          borderBottom: '2px solid #e0e0e0'
                        }}>
                          <p style={{ color: '#666', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                            📊 Total de votes: <span style={{ color: '#667eea', fontSize: '18px' }}>{currentStat.totalVotes}</span>
                          </p>
                        </div>
                        
                        {/* Podium pour les top 3 */}
                        <div className="podium-container" style={{
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'flex-end',
                          gap: '15px',
                          marginBottom: '30px',
                          padding: '20px',
                          background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)',
                          borderRadius: '15px',
                          minHeight: '200px'
                        }}>
                          {/* 2ème place */}
                          {topThree[1] && (
                            <div style={{
                              flex: '0 0 30%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              order: 1
                            }}>
                              <div style={{
                                background: 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)',
                                padding: '15px',
                                borderRadius: '12px 12px 0 0',
                                width: '100%',
                                textAlign: 'center',
                                color: 'white',
                                fontWeight: '600',
                                fontSize: '14px',
                                marginBottom: '5px',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                              }}>
                                🥈 {topThree[1].optionText}
                              </div>
                              <div style={{
                                background: 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)',
                                height: '120px',
                                width: '100%',
                                borderRadius: '0 0 8px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                color: 'white',
                                fontWeight: '700',
                                fontSize: '18px',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                              }}>
                                <div>{topThree[1].votes} votes</div>
                                <div style={{ fontSize: '14px', opacity: 0.9 }}>{topThree[1].percentage.toFixed(1)}%</div>
                              </div>
                            </div>
                          )}
                          
                          {/* 1ère place */}
                          {topThree[0] && (
                            <div style={{
                              flex: '0 0 35%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              order: 2
                            }}>
                              <div style={{
                                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                                padding: '18px',
                                borderRadius: '12px 12px 0 0',
                                width: '100%',
                                textAlign: 'center',
                                color: 'white',
                                fontWeight: '700',
                                fontSize: '16px',
                                marginBottom: '5px',
                                boxShadow: '0 6px 12px rgba(255, 215, 0, 0.4)'
                              }}>
                                🥇 {topThree[0].optionText}
                              </div>
                              <div style={{
                                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                                height: '160px',
                                width: '100%',
                                borderRadius: '0 0 8px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                color: 'white',
                                fontWeight: '700',
                                fontSize: '22px',
                                boxShadow: '0 6px 12px rgba(255, 215, 0, 0.4)'
                              }}>
                                <div>{topThree[0].votes} votes</div>
                                <div style={{ fontSize: '16px', opacity: 0.9 }}>{topThree[0].percentage.toFixed(1)}%</div>
                              </div>
                            </div>
                          )}
                          
                          {/* 3ème place */}
                          {topThree[2] && (
                            <div style={{
                              flex: '0 0 30%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              order: 3
                            }}>
                              <div style={{
                                background: 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)',
                                padding: '15px',
                                borderRadius: '12px 12px 0 0',
                                width: '100%',
                                textAlign: 'center',
                                color: 'white',
                                fontWeight: '600',
                                fontSize: '14px',
                                marginBottom: '5px',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                              }}>
                                🥉 {topThree[2].optionText}
                              </div>
                              <div style={{
                                background: 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)',
                                height: '100px',
                                width: '100%',
                                borderRadius: '0 0 8px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                color: 'white',
                                fontWeight: '700',
                                fontSize: '18px',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                              }}>
                                <div>{topThree[2].votes} votes</div>
                                <div style={{ fontSize: '14px', opacity: 0.9 }}>{topThree[2].percentage.toFixed(1)}%</div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Commentaires pour le podium */}
                        <div style={{ marginBottom: '20px', padding: '15px', background: '#f9f9f9', borderRadius: '10px' }}>
                          {topThree[0] && (
                            <div style={{ marginBottom: '10px', fontSize: '13px', fontStyle: 'italic', color: '#555' }}>
                              🏆 {topThree[0].funnyComment}
                            </div>
                          )}
                          {topThree[1] && (
                            <div style={{ marginBottom: '10px', fontSize: '13px', fontStyle: 'italic', color: '#666' }}>
                              🥈 {topThree[1].funnyComment}
                            </div>
                          )}
                          {topThree[2] && (
                            <div style={{ fontSize: '13px', fontStyle: 'italic', color: '#666' }}>
                              🥉 {topThree[2].funnyComment}
                            </div>
                          )}
                        </div>
                        
                        {/* Le reste en dessous */}
                        {rest.length > 0 && (
                          <div>
                            <h3 style={{ fontSize: '16px', color: '#666', marginBottom: '15px', textAlign: 'center' }}>
                              Le reste du classement
                            </h3>
                            {rest.map((item: { optionIndex: number; optionText: string; votes: number; percentage: number; rank: number; funnyComment: string }) => (
                              <div 
                                key={item.optionIndex} 
                                style={{ 
                                  marginBottom: '12px',
                                  padding: '12px',
                                  background: 'white',
                                  borderRadius: '8px',
                                  border: '1px solid #e0e0e0',
                                  display: 'flex',
                                  flexDirection: 'column'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                    <span style={{ fontWeight: '600', color: '#667eea', minWidth: '30px' }}>
                                      {item.rank + 1}.
                                    </span>
                                    <span>{item.optionText}</span>
                                  </div>
                                  <div style={{ textAlign: 'right', marginLeft: '15px' }}>
                                    <div style={{ fontWeight: '600', color: '#555' }}>
                                      {item.votes} vote{item.votes !== 1 ? 's' : ''}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#999' }}>
                                      {item.percentage.toFixed(1)}%
                                    </div>
                                  </div>
                                </div>
                                {/* Commentaire drôle */}
                                {item.funnyComment && (
                                  <div style={{
                                    marginTop: '8px',
                                    fontSize: '12px',
                                    color: '#888',
                                    fontStyle: 'italic',
                                    paddingTop: '8px',
                                    borderTop: '1px solid #f0f0f0'
                                  }}>
                                    {item.funnyComment}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Style STARS (étoiles)
                  if (displayStyle === 'stars') {
                    return (
                      <div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '20px',
                          paddingBottom: '15px',
                          borderBottom: '2px solid #e0e0e0'
                        }}>
                          <p style={{ color: '#666', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                            ⭐ Total de votes: <span style={{ color: '#667eea', fontSize: '18px' }}>{currentStat.totalVotes}</span>
                          </p>
                        </div>
                        
                        {sortedOptions.map((item: { optionIndex: number; optionText: string; votes: number; percentage: number; rank: number; funnyComment: string }) => {
                          const starCount = Math.ceil((item.percentage / 100) * 5); // 5 étoiles max
                          const isTopThree = item.rank < 3;
                          
                          return (
                            <div 
                              key={item.optionIndex} 
                              style={{ 
                                marginBottom: isTopThree ? '20px' : '15px',
                                padding: isTopThree ? '18px' : '15px',
                                background: isTopThree ? 'linear-gradient(135deg, #fff9e6 0%, #ffe6cc 100%)' : 'white',
                                borderRadius: '12px',
                                border: isTopThree ? '2px solid #FFD700' : '1px solid #e0e0e0',
                                boxShadow: isTopThree ? '0 4px 12px rgba(255, 215, 0, 0.2)' : '0 2px 4px rgba(0,0,0,0.05)',
                              }}
                            >
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: '10px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                  <span style={{ 
                                    fontSize: isTopThree ? '20px' : '16px',
                                    fontWeight: '600',
                                    minWidth: '35px',
                                    textAlign: 'center'
                                  }}>
                                    {item.rank === 0 ? '🥇' : item.rank === 1 ? '🥈' : item.rank === 2 ? '🥉' : `${item.rank + 1}.`}
                                  </span>
                                  <span style={{ 
                                    fontWeight: isTopThree ? '600' : '500',
                                    fontSize: isTopThree ? '16px' : '15px',
                                    color: '#333'
                                  }}>
                                    {item.optionText}
                                  </span>
                                </div>
                                <div style={{ 
                                  textAlign: 'right',
                                  marginLeft: '15px'
                                }}>
                                  <div style={{ 
                                    fontWeight: '700', 
                                    color: isTopThree ? '#FFD700' : '#555',
                                    fontSize: isTopThree ? '20px' : '18px'
                                  }}>
                                    {item.votes} vote{item.votes !== 1 ? 's' : ''}
                                  </div>
                                  <div style={{ 
                                    fontSize: '14px',
                                    color: '#999',
                                    marginTop: '2px'
                                  }}>
                                    {item.percentage.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                              
                              {/* Barre d'étoiles */}
                              <div style={{
                                display: 'flex',
                                gap: '5px',
                                alignItems: 'center',
                                marginBottom: '10px'
                              }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <span 
                                    key={i}
                                    style={{
                                      fontSize: '24px',
                                      color: i < starCount ? '#FFD700' : '#e0e0e0',
                                      transition: 'color 0.3s ease'
                                    }}
                                  >
                                    ⭐
                                  </span>
                                ))}
                                <span style={{ marginLeft: '10px', fontSize: '12px', color: '#999' }}>
                                  {starCount}/5
                                </span>
                              </div>
                              
                              {/* Commentaire drôle */}
                              <div style={{
                                fontSize: '13px',
                                color: isTopThree ? '#555' : '#888',
                                fontStyle: 'italic',
                                paddingTop: '8px',
                                borderTop: '1px solid #f0f0f0',
                                textAlign: 'left'
                              }}>
                                {item.funnyComment}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  
                  // Style CARDS (cartes)
                  if (displayStyle === 'cards') {
                    return (
                      <div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '20px',
                          paddingBottom: '15px',
                          borderBottom: '2px solid #e0e0e0'
                        }}>
                          <p style={{ color: '#666', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                            🎴 Total de votes: <span style={{ color: '#667eea', fontSize: '18px' }}>{currentStat.totalVotes}</span>
                          </p>
                        </div>
                        
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                          gap: '15px'
                        }}>
                          {sortedOptions.map((item: { optionIndex: number; optionText: string; votes: number; percentage: number; rank: number; funnyComment: string }) => {
                            const isTopThree = item.rank < 3;
                            const getCardColor = () => {
                              if (item.rank === 0) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
                              if (item.rank === 1) return 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)';
                              if (item.rank === 2) return 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)';
                              return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                            };
                            
                            return (
                              <div 
                                key={item.optionIndex} 
                                style={{ 
                                  padding: '20px',
                                  background: getCardColor(),
                                  borderRadius: '15px',
                                  color: 'white',
                                  boxShadow: isTopThree ? '0 6px 20px rgba(0,0,0,0.2)' : '0 4px 12px rgba(0,0,0,0.15)',
                                  transform: isTopThree ? 'scale(1.05)' : 'scale(1)',
                                  transition: 'transform 0.3s ease',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  minHeight: '150px'
                                }}
                              >
                                <div>
                                  <div style={{ 
                                    fontSize: '32px',
                                    marginBottom: '10px',
                                    textAlign: 'center'
                                  }}>
                                    {item.rank === 0 ? '🥇' : item.rank === 1 ? '🥈' : item.rank === 2 ? '🥉' : `${item.rank + 1}.`}
                                  </div>
                                  <div style={{ 
                                    fontWeight: '700',
                                    fontSize: '18px',
                                    marginBottom: '15px',
                                    textAlign: 'center',
                                    textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                  }}>
                                    {item.optionText}
                                  </div>
                                </div>
                                
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ 
                                    fontSize: '28px',
                                    fontWeight: '700',
                                    marginBottom: '5px',
                                    textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                  }}>
                                    {item.votes}
                                  </div>
                                  <div style={{ 
                                    fontSize: '14px',
                                    opacity: 0.9
                                  }}>
                                    vote{item.votes !== 1 ? 's' : ''} • {item.percentage.toFixed(1)}%
                                  </div>
                                  <div style={{
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    fontStyle: 'italic',
                                    opacity: 0.95,
                                    paddingTop: '10px',
                                    borderTop: '1px solid rgba(255,255,255,0.3)'
                                  }}>
                                    {item.funnyComment}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  
                  // Style BARS (par défaut - barres de progression)
                  return (
                    <div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '20px',
                        paddingBottom: '15px',
                        borderBottom: '2px solid #e0e0e0'
                      }}>
                        <p style={{ color: '#666', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                          📊 Total de votes: <span style={{ color: '#667eea', fontSize: '18px' }}>{currentStat.totalVotes}</span>
                        </p>
                      </div>
                      
                      {sortedOptions.map((item: { optionIndex: number; optionText: string; votes: number; percentage: number; rank: number; funnyComment: string }) => {
                        const isTopThree = item.rank < 3;
                        const getRankColor = (rank: number) => {
                          if (rank === 0) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
                          if (rank === 1) return 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)';
                          if (rank === 2) return 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)';
                          return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                        };
                        
                        const getRankEmoji = (rank: number) => {
                          if (rank === 0) return '🥇';
                          if (rank === 1) return '🥈';
                          if (rank === 2) return '🥉';
                          return `${rank + 1}.`;
                        };
                        
                        return (
                          <div 
                            key={item.optionIndex} 
                            style={{ 
                              marginBottom: isTopThree ? '20px' : '15px',
                              padding: isTopThree ? '18px' : '15px',
                              background: isTopThree ? '#f9f9f9' : 'white',
                              borderRadius: '12px',
                              border: isTopThree ? `3px solid ${item.rank === 0 ? '#FFD700' : item.rank === 1 ? '#C0C0C0' : '#CD7F32'}` : '1px solid #e0e0e0',
                              boxShadow: isTopThree ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              marginBottom: '12px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                <span style={{ 
                                  fontSize: isTopThree ? '24px' : '18px',
                                  fontWeight: '600',
                                  minWidth: '35px',
                                  textAlign: 'center'
                                }}>
                                  {getRankEmoji(item.rank)}
                                </span>
                                <span style={{ 
                                  fontWeight: isTopThree ? '600' : '500',
                                  fontSize: isTopThree ? '16px' : '15px',
                                  color: '#333'
                                }}>
                                  {item.optionText}
                                </span>
                              </div>
                              <div style={{ 
                                textAlign: 'right',
                                marginLeft: '15px'
                              }}>
                                <div style={{ 
                                  fontWeight: '700', 
                                  color: isTopThree ? '#667eea' : '#555',
                                  fontSize: isTopThree ? '20px' : '18px'
                                }}>
                                  {item.votes} vote{item.votes !== 1 ? 's' : ''}
                                </div>
                                <div style={{ 
                                  fontSize: '14px',
                                  color: '#999',
                                  marginTop: '2px'
                                }}>
                                  {item.percentage.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                            
                            <div style={{
                              width: '100%',
                              height: isTopThree ? '40px' : '35px',
                              background: '#e0e0e0',
                              borderRadius: '20px',
                              overflow: 'hidden',
                              position: 'relative',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                              marginBottom: '10px'
                            }}>
                              <div
                                style={{
                                  width: `${item.percentage}%`,
                                  height: '100%',
                                  background: getRankColor(item.rank),
                                  transition: 'width 0.8s ease',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  paddingRight: item.percentage > 8 ? '15px' : '5px',
                                  color: 'white',
                                  fontSize: isTopThree ? '14px' : '12px',
                                  fontWeight: '700',
                                  boxShadow: isTopThree ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                                }}
                              >
                                {item.percentage > 8 && (
                                  <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                    {item.percentage.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Commentaire drôle */}
                            <div style={{
                              fontSize: '13px',
                              color: isTopThree ? '#555' : '#888',
                              fontStyle: 'italic',
                              paddingTop: '8px',
                              borderTop: '1px solid #f0f0f0',
                              textAlign: 'left'
                            }}>
                              {item.funnyComment}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: '#999',
              fontSize: '16px'
            }}>
              Chargement des résultats...
            </div>
          )}
          
          {/* Boutons pour quitter et faire un nouveau sondage à la fin du dernier résultat */}
          {currentResultIndex >= questions.length - 1 && (
            <div style={{
              marginTop: '40px',
              padding: '30px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '15px',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
            }}>
              <h2 style={{ color: 'white', marginBottom: '20px', fontSize: '24px' }}>
                🎉 Tous les résultats ont été affichés !
              </h2>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowBonusResults(!showBonusResults)}
                  className="button"
                  style={{
                    background: showBonusResults ? '#f5576c' : 'white',
                    color: showBonusResults ? 'white' : '#f5576c',
                    fontSize: '16px',
                    padding: '15px 30px',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  {showBonusResults ? '📊 Masquer les résultats bonus' : '⭐ Voir les résultats bonus'}
                </button>
                <button
                  onClick={handleLeaveSession}
                  className="button"
                  style={{
                    background: 'white',
                    color: '#667eea',
                    fontSize: '16px',
                    padding: '15px 30px',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  🚪 Quitter la session
                </button>
                <button
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }}
                  className="button"
                  style={{
                    background: 'white',
                    color: '#764ba2',
                    fontSize: '16px',
                    padding: '15px 30px',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  🔄 Nouveau Sondage
                </button>
              </div>
            </div>
          )}

          {/* Affichage des résultats bonus */}
          {showBonusResults && currentResultIndex >= questions.length - 1 && (() => {
            const bonusStats = calculateBonusStats();
            if (!bonusStats || bonusStats.length === 0) {
              return (
                <div style={{
                  marginTop: '30px',
                  padding: '30px',
                  background: '#f9f9f9',
                  borderRadius: '15px',
                  textAlign: 'center',
                  border: '1px solid #e0e0e0'
                }}>
                  <p style={{ color: '#666', fontSize: '16px' }}>
                    Aucune statistique bonus disponible pour le moment.
                  </p>
                </div>
              );
            }

            return (
              <div style={{
                marginTop: '30px',
                padding: '30px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: '15px',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
              }}>
                <h2 style={{ color: 'white', marginBottom: '15px', fontSize: '32px', textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  ⭐ Résultats Bonus 🎉
                </h2>
                <p style={{ color: 'rgba(255, 255, 255, 0.95)', marginBottom: '30px', fontSize: '16px', textAlign: 'center', fontStyle: 'italic' }}>
                  Combien de fois chaque réponse a été première, deuxième ou troisième sur TOUTES les questions !
                </p>
                
                {/* Graphiques et visualisations */}
                <div style={{
                  marginBottom: '40px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '20px'
                }}>
                  {/* Graphique en barres - Top 5 des premières places */}
                  {bonusStats.length > 0 && (() => {
                    const top5First = [...bonusStats]
                      .filter(s => s.first > 0)
                      .slice(0, 5)
                      .sort((a, b) => b.first - a.first);
                    const maxFirst = Math.max(...top5First.map(s => s.first), 1);
                    
                    return (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        padding: '25px',
                        borderRadius: '15px',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                      }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', color: '#333', textAlign: 'center', fontWeight: '700' }}>
                          📊 Top 5 - Premières Places
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                          {top5First.map((stat, idx) => {
                            const percentage = (stat.first / maxFirst) * 100;
                            return (
                              <div key={stat.optionText} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {idx === 0 && '🥇'} {idx === 1 && '🥈'} {idx === 2 && '🥉'} {stat.optionText}
                                  </span>
                                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#667eea', marginLeft: '10px' }}>
                                    {stat.first}
                                  </span>
                                </div>
                                <div style={{
                                  width: '100%',
                                  height: '30px',
                                  background: '#e0e0e0',
                                  borderRadius: '15px',
                                  overflow: 'hidden',
                                  position: 'relative'
                                }}>
                                  <div style={{
                                    width: `${percentage}%`,
                                    height: '100%',
                                    background: idx === 0 
                                      ? 'linear-gradient(90deg, #ffd700 0%, #ffed4e 100%)'
                                      : idx === 1
                                      ? 'linear-gradient(90deg, #c0c0c0 0%, #e8e8e8 100%)'
                                      : idx === 2
                                      ? 'linear-gradient(90deg, #cd7f32 0%, #e6a857 100%)'
                                      : 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                                    borderRadius: '15px',
                                    transition: 'width 1s ease-out',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: '10px',
                                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                                  }}>
                                    {percentage > 20 && (
                                      <span style={{ fontSize: '12px', fontWeight: '700', color: idx < 3 ? '#333' : 'white' }}>
                                        {stat.first}x
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Graphique circulaire - Répartition des podiums */}
                  {bonusStats.length > 0 && (() => {
                    const totalFirst = bonusStats.reduce((sum, s) => sum + s.first, 0);
                    const totalSecond = bonusStats.reduce((sum, s) => sum + s.second, 0);
                    const totalThird = bonusStats.reduce((sum, s) => sum + s.third, 0);
                    const totalPodiums = totalFirst + totalSecond + totalThird;
                    
                    if (totalPodiums > 0) {
                      const firstPercent = (totalFirst / totalPodiums) * 100;
                      const secondPercent = (totalSecond / totalPodiums) * 100;
                      const thirdPercent = (totalThird / totalPodiums) * 100;
                      
                      // Calculer les angles pour le graphique circulaire
                      const firstAngle = (firstPercent / 100) * 360;
                      const secondAngle = (secondPercent / 100) * 360;
                      const thirdAngle = (thirdPercent / 100) * 360;
                      
                      return (
                        <div style={{
                          background: 'rgba(255, 255, 255, 0.95)',
                          padding: '25px',
                          borderRadius: '15px',
                          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center'
                        }}>
                          <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', color: '#333', textAlign: 'center', fontWeight: '700' }}>
                            🎯 Répartition des Podiums
                          </h3>
                          <div style={{ position: 'relative', width: '200px', height: '200px', marginBottom: '20px' }}>
                            {/* Graphique circulaire en CSS */}
                            <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                              <circle
                                cx="100"
                                cy="100"
                                r="80"
                                fill="none"
                                stroke="#e0e0e0"
                                strokeWidth="40"
                              />
                              {firstPercent > 0 && (
                                <circle
                                  cx="100"
                                  cy="100"
                                  r="80"
                                  fill="none"
                                  stroke="#667eea"
                                  strokeWidth="40"
                                  strokeDasharray={`${(firstAngle / 360) * 502.4} 502.4`}
                                  style={{ transition: 'stroke-dasharray 1s ease-out' }}
                                />
                              )}
                              {secondPercent > 0 && (
                                <circle
                                  cx="100"
                                  cy="100"
                                  r="80"
                                  fill="none"
                                  stroke="#f5576c"
                                  strokeWidth="40"
                                  strokeDasharray={`${(secondAngle / 360) * 502.4} 502.4`}
                                  strokeDashoffset={-(firstAngle / 360) * 502.4}
                                  style={{ transition: 'stroke-dasharray 1s ease-out' }}
                                />
                              )}
                              {thirdPercent > 0 && (
                                <circle
                                  cx="100"
                                  cy="100"
                                  r="80"
                                  fill="none"
                                  stroke="#4facfe"
                                  strokeWidth="40"
                                  strokeDasharray={`${(thirdAngle / 360) * 502.4} 502.4`}
                                  strokeDashoffset={-((firstAngle + secondAngle) / 360) * 502.4}
                                  style={{ transition: 'stroke-dasharray 1s ease-out' }}
                                />
                              )}
                            </svg>
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              textAlign: 'center'
                            }}>
                              <div style={{ fontSize: '32px', fontWeight: '800', color: '#333' }}>
                                {totalPodiums}
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                Total
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '20px', height: '20px', background: '#667eea', borderRadius: '4px' }}></div>
                              <span style={{ fontSize: '14px', flex: 1 }}>1er place</span>
                              <span style={{ fontSize: '16px', fontWeight: '700', color: '#667eea' }}>{totalFirst}</span>
                              <span style={{ fontSize: '14px', color: '#666' }}>({firstPercent.toFixed(1)}%)</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '20px', height: '20px', background: '#f5576c', borderRadius: '4px' }}></div>
                              <span style={{ fontSize: '14px', flex: 1 }}>2ème place</span>
                              <span style={{ fontSize: '16px', fontWeight: '700', color: '#f5576c' }}>{totalSecond}</span>
                              <span style={{ fontSize: '14px', color: '#666' }}>({secondPercent.toFixed(1)}%)</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '20px', height: '20px', background: '#4facfe', borderRadius: '4px' }}></div>
                              <span style={{ fontSize: '14px', flex: 1 }}>3ème place</span>
                              <span style={{ fontSize: '16px', fontWeight: '700', color: '#4facfe' }}>{totalThird}</span>
                              <span style={{ fontSize: '14px', color: '#666' }}>({thirdPercent.toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  {/* Graphique comparatif - Total des apparitions */}
                  {bonusStats.length > 0 && (() => {
                    const top10Total = [...bonusStats].slice(0, 10).sort((a, b) => b.total - a.total);
                    const maxTotal = Math.max(...top10Total.map(s => s.total), 1);
                    
                    return (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        padding: '25px',
                        borderRadius: '15px',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                      }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', color: '#333', textAlign: 'center', fontWeight: '700' }}>
                          📈 Top 10 - Total des Apparitions
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {top10Total.map((stat, idx) => {
                            const percentage = (stat.total / maxTotal) * 100;
                            return (
                              <div key={stat.optionText} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {idx + 1}. {stat.optionText}
                                  </span>
                                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#764ba2', marginLeft: '10px' }}>
                                    {stat.total}
                                  </span>
                                </div>
                                <div style={{
                                  width: '100%',
                                  height: '25px',
                                  background: '#f0f0f0',
                                  borderRadius: '12px',
                                  overflow: 'hidden',
                                  position: 'relative'
                                }}>
                                  <div style={{
                                    width: `${percentage}%`,
                                    height: '100%',
                                    background: `linear-gradient(90deg, hsl(${240 - idx * 10}, 70%, 60%) 0%, hsl(${240 - idx * 10}, 70%, 75%) 100%)`,
                                    borderRadius: '12px',
                                    transition: 'width 1s ease-out',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: percentage > 15 ? '8px' : '0',
                                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                                  }}>
                                    {percentage > 15 && (
                                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'white' }}>
                                        {stat.total}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#999', marginTop: '2px' }}>
                                  {stat.first > 0 && <span>🥇 {stat.first}</span>}
                                  {stat.second > 0 && <span>🥈 {stat.second}</span>}
                                  {stat.third > 0 && <span>🥉 {stat.third}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {bonusStats.map((stat, index) => {
                    const isTop = index === 0 && stat.first > 0;
                    const isSecond = index === 1;
                    const isThird = index === 2;
                    
                    // Emoji selon le rang
                    let rankEmoji = '';
                    if (isTop && stat.first >= 3) rankEmoji = '👑';
                    else if (isTop && stat.first >= 2) rankEmoji = '🏆';
                    else if (isTop) rankEmoji = '🥇';
                    else if (isSecond) rankEmoji = '🥈';
                    else if (isThird) rankEmoji = '🥉';
                    else if (stat.first > 0) rankEmoji = '⭐';
                    else if (stat.second > 0) rankEmoji = '✨';
                    else rankEmoji = '💫';
                    
                    return (
                      <div
                        key={stat.optionText}
                        style={{
                          background: isTop 
                            ? 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)' 
                            : isSecond
                            ? 'linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%)'
                            : isThird
                            ? 'linear-gradient(135deg, #cd7f32 0%, #e6a857 100%)'
                            : 'rgba(255, 255, 255, 0.95)',
                          padding: isTop ? '30px' : '25px',
                          borderRadius: '15px',
                          border: isTop ? '4px solid #ff6b6b' : isSecond ? '3px solid #4ecdc4' : isThird ? '3px solid #ffe66d' : '2px solid rgba(0, 0, 0, 0.1)',
                          boxShadow: isTop 
                            ? '0 8px 25px rgba(255, 107, 107, 0.4)' 
                            : isSecond
                            ? '0 6px 20px rgba(78, 205, 196, 0.3)'
                            : isThird
                            ? '0 6px 20px rgba(255, 230, 109, 0.3)'
                            : '0 4px 12px rgba(0, 0, 0, 0.1)',
                          transform: isTop ? 'scale(1.03)' : isSecond || isThird ? 'scale(1.01)' : 'none',
                          transition: 'all 0.3s ease',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Effet de brillance pour le top 3 */}
                        {(isTop || isSecond || isThird) && (
                          <div style={{
                            position: 'absolute',
                            top: '-50%',
                            left: '-50%',
                            width: '200%',
                            height: '200%',
                            background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)',
                            animation: 'shine 3s infinite',
                            pointerEvents: 'none'
                          }} />
                        )}
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                          {/* En-tête avec nom et emoji */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: isTop ? '36px' : isSecond || isThird ? '32px' : '28px' }}>
                              {rankEmoji}
                            </span>
                            <div style={{ flex: 1 }}>
                              <h3 style={{ 
                                margin: 0,
                                fontWeight: isTop ? '800' : isSecond || isThird ? '700' : '600', 
                                fontSize: isTop ? '24px' : isSecond || isThird ? '22px' : '20px',
                                color: isTop ? '#d63031' : isSecond ? '#00b894' : isThird ? '#fdcb6e' : '#333',
                                textShadow: isTop ? '0 2px 4px rgba(0,0,0,0.2)' : 'none'
                              }}>
                                {stat.optionText}
                              </h3>
                              <p style={{ 
                                margin: '5px 0 0 0',
                                fontSize: '14px',
                                color: isTop ? '#c0392b' : isSecond ? '#00a085' : isThird ? '#e17055' : '#666',
                                fontStyle: 'italic',
                                fontWeight: '500'
                              }}>
                                {stat.comment}
                              </p>
                            </div>
                          </div>
                          
                          {/* Stats visuelles */}
                          <div style={{ 
                            display: 'flex', 
                            gap: '15px', 
                            alignItems: 'center', 
                            flexWrap: 'wrap',
                            padding: '15px',
                            background: isTop ? 'rgba(255, 255, 255, 0.3)' : isSecond || isThird ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.03)',
                            borderRadius: '10px'
                          }}>
                            {stat.first > 0 && (
                              <div style={{ 
                                textAlign: 'center',
                                padding: '12px 20px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '10px',
                                color: 'white',
                                boxShadow: '0 4px 10px rgba(102, 126, 234, 0.3)',
                                minWidth: '100px'
                              }}>
                                <div style={{ fontSize: '32px', fontWeight: '800', lineHeight: '1', marginBottom: '5px' }}>
                                  {stat.first}
                                </div>
                                <div style={{ fontSize: '13px', opacity: 0.95, fontWeight: '600' }}>
                                  {stat.first === 1 ? 'fois 1er' : 'fois 1er'}
                                </div>
                              </div>
                            )}
                            {stat.second > 0 && (
                              <div style={{ 
                                textAlign: 'center',
                                padding: '10px 18px',
                                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                borderRadius: '10px',
                                color: 'white',
                                boxShadow: '0 4px 10px rgba(245, 87, 108, 0.3)',
                                minWidth: '90px'
                              }}>
                                <div style={{ fontSize: '28px', fontWeight: '700', lineHeight: '1', marginBottom: '5px' }}>
                                  {stat.second}
                                </div>
                                <div style={{ fontSize: '12px', opacity: 0.95, fontWeight: '600' }}>
                                  {stat.second === 1 ? 'fois 2ème' : 'fois 2ème'}
                                </div>
                              </div>
                            )}
                            {stat.third > 0 && (
                              <div style={{ 
                                textAlign: 'center',
                                padding: '10px 18px',
                                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                borderRadius: '10px',
                                color: 'white',
                                boxShadow: '0 4px 10px rgba(79, 172, 254, 0.3)',
                                minWidth: '90px'
                              }}>
                                <div style={{ fontSize: '26px', fontWeight: '700', lineHeight: '1', marginBottom: '5px' }}>
                                  {stat.third}
                                </div>
                                <div style={{ fontSize: '12px', opacity: 0.95, fontWeight: '600' }}>
                                  {stat.third === 1 ? 'fois 3ème' : 'fois 3ème'}
                                </div>
                              </div>
                            )}
                            {stat.total > 0 && (
                              <div style={{ 
                                textAlign: 'center',
                                padding: '12px 20px',
                                background: isTop ? 'rgba(255, 255, 255, 0.9)' : isSecond || isThird ? 'rgba(255, 255, 255, 0.8)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '10px',
                                color: isTop ? '#d63031' : isSecond ? '#00b894' : isThird ? '#e17055' : 'white',
                                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
                                minWidth: '100px',
                                fontWeight: '700'
                              }}>
                                <div style={{ fontSize: '30px', fontWeight: '800', lineHeight: '1', marginBottom: '5px' }}>
                                  {stat.total}
                                </div>
                                <div style={{ fontSize: '13px', opacity: 0.9, fontWeight: '600' }}>
                                  Total
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Style pour l'animation de brillance */}
                <style dangerouslySetInnerHTML={{
                  __html: `
                    @keyframes shine {
                      0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
                      100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
                    }
                  `
                }} />
              </div>
            );
          })()}

          {!isAdmin && (
            <div style={{
              marginTop: '30px',
              padding: '15px',
              background: '#e3f2fd',
              borderRadius: '10px',
              textAlign: 'center',
              color: '#1976d2',
              fontSize: '14px'
            }}>
              ⏳ En attente de l&apos;administrateur pour passer au résultat suivant...
            </div>
          )}
        </div>
      );
    }

    // Mode ancien (tous les résultats d'un coup) - pour compatibilité avec les sessions terminées
    return (
      <div className="container">
        <h1>📊 Résultats du Formulaire</h1>
        {isSpectator && (
          <div style={{
            background: 'linear-gradient(135deg, #ffd89b 0%, #19547b 100%)',
            color: 'white',
            padding: '15px 20px',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
          }}>
            <span style={{ fontSize: '24px' }}>👁️</span>
            <div>
              <strong style={{ fontSize: '16px' }}>Mode Spectateur</strong>
              <div style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>
                Cette session est terminée. Vous pouvez consulter les résultats mais vous n&apos;êtes pas comptabilisé comme participant.
              </div>
            </div>
          </div>
        )}
        <div className="stats">
          <div className="stat-card">
            <div className="stat-value">{results.length}</div>
            <div className="stat-label">Participants</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{questions.length}</div>
            <div className="stat-label">Questions</div>
          </div>
        </div>

        {/* Statistiques par question */}
        <div style={{ marginTop: '40px' }}>
          <h2>📈 Statistiques Détaillées par Question</h2>
          {questionStats && Array.isArray(questionStats) && questionStats.length > 0 ? (
            questionStats.map((stat: any, idx: number) => (
            <div
              key={idx}
              style={{
                background: '#f9f9f9',
                padding: '20px',
                borderRadius: '15px',
                marginBottom: '25px',
                border: '1px solid #e0e0e0'
              }}
            >
              <h3 style={{ marginBottom: '15px', color: '#333', fontSize: '18px' }}>
                Question {idx + 1}: {stat.question}
              </h3>
              {stat.type === 'ranking' ? (
                <div>
                  <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
                    Réponses reçues: {stat.totalVotes}
                  </p>
                  {stat.options && Array.isArray(stat.options) && stat.options.length > 0 ? (
                    <div>
                      {stat.options
                        .map((option: string | Option, optIndex: number) => ({ option, optIndex }))
                        .map(({ optIndex }: { option: string | Option; optIndex: number }) => optIndex)
                        .sort((a: number, b: number) => {
                          // Trier par moyenne croissante (meilleure position = plus petite moyenne)
                          const avgA = stat.rankingAverages?.[a]?.average ?? (stat.options.length);
                          const avgB = stat.rankingAverages?.[b]?.average ?? (stat.options.length);
                          return avgA - avgB;
                        })
                        .map((optionIndex: number, rankIndex: number) => {
                          const avgData = stat.rankingAverages?.[optionIndex];
                          const averagePosition = avgData?.average ?? (stat.options.length - 1);
                          const displayedPosition = averagePosition + 1; // Ajouter 1 pour commencer à 1 au lieu de 0
                          const count = avgData?.count ?? 0;
                          const option = stat.options[optionIndex];
                          const optionText = getOptionText(option);
                          const isFirst = rankIndex === 0 && count > 0; // Premier élément (le mieux classé)
                          const hasNoVotes = count === 0;
                            
                            return (
                              <div key={optionIndex} style={{ 
                                marginBottom: '15px',
                                padding: isFirst ? '20px' : '15px',
                                background: isFirst ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                                borderRadius: '8px',
                                border: isFirst ? 'none' : '1px solid #e0e0e0',
                                boxShadow: isFirst ? '0 4px 12px rgba(102, 126, 234, 0.4)' : '0 2px 4px rgba(0,0,0,0.05)',
                                transform: isFirst ? 'scale(1.02)' : 'none',
                                transition: 'all 0.3s ease'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ 
                                      fontWeight: isFirst ? '600' : '500', 
                                      fontSize: isFirst ? '16px' : '15px', 
                                      color: isFirst ? 'white' : '#333' 
                                    }}>
                                      {isFirst && <span style={{ marginRight: '8px' }}>🏆</span>}
                                      {optionText}
                                    </span>
                                  </div>
                                  <div style={{ textAlign: 'right', marginLeft: '20px' }}>
                                    <div style={{ 
                                      fontWeight: '600', 
                                      color: isFirst ? 'white' : '#667eea', 
                                      fontSize: isFirst ? '22px' : '18px' 
                                    }}>
                                      {displayedPosition.toFixed(2)}
                                    </div>
                                    <div style={{ 
                                      fontSize: '11px', 
                                      color: isFirst ? 'rgba(255,255,255,0.9)' : '#999', 
                                      marginTop: '2px' 
                                    }}>
                                      position moyenne
                                    </div>
                                    {hasNoVotes ? (
                                      <div style={{ 
                                        fontSize: '11px', 
                                        color: '#999', 
                                        marginTop: '4px' 
                                      }}>
                                        (0 réponse)
                                      </div>
                                    ) : (
                                      <div style={{ 
                                        fontSize: '11px', 
                                        color: isFirst ? 'rgba(255,255,255,0.8)' : '#999', 
                                        marginTop: '4px' 
                                      }}>
                                        ({count} réponse{count !== 1 ? 's' : ''})
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {!hasNoVotes && (
                                  <div style={{
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    color: isFirst ? 'rgba(255,255,255,0.95)' : '#666',
                                    fontStyle: 'italic',
                                    paddingTop: '8px',
                                    borderTop: isFirst ? '1px solid rgba(255,255,255,0.3)' : '1px solid #f0f0f0'
                                  }}>
                                    {averagePosition < 0.5 ? '⭐ Très bien classé (préféré)' : 
                                     averagePosition < 1.5 ? '👍 Bien classé' :
                                     averagePosition < 2.5 ? '➖ Moyennement classé' : 
                                     averagePosition < 3.5 ? '👎 Moins bien classé' : '❌ Très mal classé'}
                                  </div>
                                )}
                                {hasNoVotes && (
                                  <div style={{
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    color: '#999',
                                    fontStyle: 'italic',
                                    paddingTop: '8px',
                                    borderTop: '1px solid #f0f0f0'
                                  }}>
                                    ⚪ Aucune réponse reçue
                                  </div>
                                )}
                              </div>
                            );
                          })
                      }
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                      Aucune option disponible.
                    </div>
                  )}
                </div>
              ) : stat.type === 'pairing' ? (
                <div>
                  <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
                    Réponses reçues: {stat.totalVotes}
                  </p>
                  {stat.coupleVotes && Object.keys(stat.coupleVotes).length > 0 ? (
                    <div>
                      {Object.entries(stat.coupleVotes)
                        .map(([coupleKey, votes]: [string, any]) => {
                          const [firstIndex, secondIndex] = coupleKey.split(',').map(Number);
                          return {
                            coupleKey,
                            firstIndex,
                            secondIndex,
                            votes: votes as number
                          };
                        })
                        .sort((a, b) => b.votes - a.votes)
                        .map((couple, rankIndex) => {
                          const firstOption = stat.options[couple.firstIndex];
                          const secondOption = stat.options[couple.secondIndex];
                          const firstText = getOptionText(firstOption);
                          const secondText = getOptionText(secondOption);
                          const isTopThree = rankIndex < 3;
                          const percentage = stat.totalVotes > 0 ? (couple.votes / stat.totalVotes) * 100 : 0;
                          
                          const getRankColor = (rank: number) => {
                            if (rank === 0) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
                            if (rank === 1) return 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)';
                            if (rank === 2) return 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)';
                            return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                          };
                          
                          const getRankEmoji = (rank: number) => {
                            if (rank === 0) return '🥇';
                            if (rank === 1) return '🥈';
                            if (rank === 2) return '🥉';
                            return `${rank + 1}.`;
                          };
                          
                          return (
                            <div 
                              key={couple.coupleKey} 
                              style={{ 
                                marginBottom: isTopThree ? '20px' : '15px',
                                padding: isTopThree ? '18px' : '15px',
                                background: isTopThree ? '#f9f9f9' : 'white',
                                borderRadius: '12px',
                                border: isTopThree ? `3px solid ${rankIndex === 0 ? '#FFD700' : rankIndex === 1 ? '#C0C0C0' : '#CD7F32'}` : '1px solid #e0e0e0',
                                boxShadow: isTopThree ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
                              }}
                            >
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                  <span style={{ 
                                    fontSize: isTopThree ? '24px' : '18px',
                                    fontWeight: '600',
                                    minWidth: '35px',
                                    textAlign: 'center'
                                  }}>
                                    {getRankEmoji(rankIndex)}
                                  </span>
                                  <span style={{ 
                                    fontWeight: isTopThree ? '600' : '500',
                                    fontSize: isTopThree ? '16px' : '15px',
                                    color: '#333'
                                  }}>
                                    {firstText} & {secondText}
                                  </span>
                                </div>
                                <div style={{ 
                                  textAlign: 'right',
                                  marginLeft: '15px'
                                }}>
                                  <div style={{ 
                                    fontWeight: '700', 
                                    color: isTopThree ? '#667eea' : '#555',
                                    fontSize: isTopThree ? '20px' : '18px'
                                  }}>
                                    {couple.votes} vote{couple.votes !== 1 ? 's' : ''}
                                  </div>
                                  <div style={{ 
                                    fontSize: '14px',
                                    color: '#999',
                                    marginTop: '2px'
                                  }}>
                                    {percentage.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                              
                              <div style={{
                                width: '100%',
                                height: isTopThree ? '40px' : '35px',
                                background: '#e0e0e0',
                                borderRadius: '20px',
                                overflow: 'hidden',
                                position: 'relative',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                              }}>
                                <div
                                  style={{
                                    width: `${percentage}%`,
                                    height: '100%',
                                    background: getRankColor(rankIndex),
                                    transition: 'width 0.8s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: percentage > 8 ? '15px' : '5px',
                                    color: 'white',
                                    fontSize: isTopThree ? '14px' : '12px',
                                    fontWeight: '700',
                                    boxShadow: isTopThree ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                                  }}
                                >
                                  {percentage > 8 && (
                                    <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                      {percentage.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                      Aucun couple n&apos;a été sélectionné.
                    </div>
                  )}
                </div>
              ) : stat.type === 'categorization' ? (
                <div>
                  <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
                    Réponses reçues: {stat.totalVotes}
                  </p>
                  {stat.personCategories && stat.options && Array.isArray(stat.options) && stat.options.length > 0 ? (
                    <div>
                      {(() => {
                        const question = questions[idx];
                        const categoryA = question?.categoryA || 'Catégorie A';
                        const categoryB = question?.categoryB || 'Catégorie B';
                        return stat.options.map((option: string | Option, personIndex: number) => {
                          const categoryData = stat.personCategories[personIndex];
                          if (!categoryData) return null;
                          
                          const totalVotes = categoryData.categoryA + categoryData.categoryB;
                          const isMoreA = categoryData.categoryA > categoryData.categoryB;
                          const isMoreB = categoryData.categoryB > categoryData.categoryA;
                          const isEqual = categoryData.categoryA === categoryData.categoryB;
                          const percentageA = totalVotes > 0 ? (categoryData.categoryA / totalVotes) * 100 : 0;
                          const percentageB = totalVotes > 0 ? (categoryData.categoryB / totalVotes) * 100 : 0;
                          
                          return (
                            <div
                              key={personIndex}
                              style={{
                                marginBottom: '15px',
                                padding: '15px',
                                background: isMoreA ? '#e3f2fd' : isMoreB ? '#fff3e0' : '#f5f5f5',
                                borderRadius: '8px',
                                border: isMoreA ? '2px solid #2196f3' : isMoreB ? '2px solid #ff9800' : '2px solid #e0e0e0'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ fontWeight: '600', fontSize: '16px', color: '#333' }}>
                                  {getOptionText(option)}
                                </div>
                                <div style={{ fontSize: '14px', color: '#666' }}>
                                  {totalVotes} réponse{totalVotes !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                <div style={{ flex: 1, padding: '10px', background: '#e3f2fd', borderRadius: '6px', textAlign: 'center' }}>
                                  <div style={{ fontWeight: '600', color: '#1976d2', marginBottom: '5px' }}>
                                    {categoryA}
                                  </div>
                                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#1976d2' }}>
                                    {categoryData.categoryA}
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                    ({percentageA.toFixed(1)}%)
                                  </div>
                                </div>
                                <div style={{ flex: 1, padding: '10px', background: '#fff3e0', borderRadius: '6px', textAlign: 'center' }}>
                                  <div style={{ fontWeight: '600', color: '#f57c00', marginBottom: '5px' }}>
                                    {categoryB}
                                  </div>
                                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#f57c00' }}>
                                    {categoryData.categoryB}
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                    ({percentageB.toFixed(1)}%)
                                  </div>
                                </div>
                              </div>
                              {totalVotes > 0 && (
                                <div style={{ 
                                  marginTop: '10px', 
                                  padding: '8px', 
                                  background: isMoreA ? '#2196f3' : isMoreB ? '#ff9800' : '#9e9e9e',
                                  borderRadius: '6px',
                                  color: 'white',
                                  textAlign: 'center',
                                  fontWeight: '600',
                                  fontSize: '14px'
                                }}>
                                  {isEqual 
                                    ? `Égalité entre ${categoryA} et ${categoryB}`
                                    : `Plus classé dans ${isMoreA ? categoryA : categoryB}`
                                  }
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                      Aucune réponse disponible.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '20px',
                    paddingBottom: '15px',
                    borderBottom: '2px solid #e0e0e0'
                  }}>
                    <p style={{ color: '#666', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      📊 Total de votes: <span style={{ color: '#667eea', fontSize: '18px' }}>{stat.totalVotes}</span>
                    </p>
                  </div>
                  
                  {/* Trier les options par nombre de votes décroissant */}
                  {stat.options && Array.isArray(stat.options) && 
                    stat.options
                      .map((option: string | Option, optIndex: number) => ({ option, optIndex }))
                      .map(({ optIndex }: { option: string | Option; optIndex: number }) => optIndex)
                      .sort((a: number, b: number) => {
                        const votesA = stat.votes[a] || 0;
                        const votesB = stat.votes[b] || 0;
                        return votesB - votesA; // Tri décroissant
                      })
                      .map((optIndex: number, rank: number) => {
                        const votes = stat.votes[optIndex] || 0;
                        const percentage = stat.totalVotes > 0 ? (votes / stat.totalVotes) * 100 : 0;
                        const option = stat.options[optIndex];
                        const optionText = getOptionText(option);
                        
                        // Couleurs selon le classement
                        const getRankColor = (rank: number) => {
                          if (rank === 0) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'; // Or
                          if (rank === 1) return 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)'; // Argent
                          if (rank === 2) return 'linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)'; // Bronze
                          return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'; // Par défaut
                        };
                        
                        const getRankEmoji = (rank: number) => {
                          if (rank === 0) return '🥇';
                          if (rank === 1) return '🥈';
                          if (rank === 2) return '🥉';
                          return `${rank + 1}.`;
                        };
                        
                        const isTopThree = rank < 3;
                        
                        return (
                          <div 
                            key={optIndex} 
                            style={{ 
                              marginBottom: isTopThree ? '20px' : '15px',
                              padding: isTopThree ? '18px' : '15px',
                              background: isTopThree ? '#f9f9f9' : 'white',
                              borderRadius: '12px',
                              border: isTopThree ? `3px solid ${rank === 0 ? '#FFD700' : rank === 1 ? '#C0C0C0' : '#CD7F32'}` : '1px solid #e0e0e0',
                              boxShadow: isTopThree ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
                              transition: 'transform 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              marginBottom: '12px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                <span style={{ 
                                  fontSize: isTopThree ? '24px' : '18px',
                                  fontWeight: '600',
                                  minWidth: '35px',
                                  textAlign: 'center'
                                }}>
                                  {getRankEmoji(rank)}
                                </span>
                                <span style={{ 
                                  fontWeight: isTopThree ? '600' : '500',
                                  fontSize: isTopThree ? '16px' : '15px',
                                  color: '#333'
                                }}>
                                  {optionText}
                                </span>
                              </div>
                              <div style={{ 
                                textAlign: 'right',
                                marginLeft: '15px'
                              }}>
                                <div style={{ 
                                  fontWeight: '700', 
                                  color: isTopThree ? '#667eea' : '#555',
                                  fontSize: isTopThree ? '20px' : '18px'
                                }}>
                                  {votes} vote{votes !== 1 ? 's' : ''}
                                </div>
                                <div style={{ 
                                  fontSize: '14px',
                                  color: '#999',
                                  marginTop: '2px'
                                }}>
                                  {percentage.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                            
                            {/* Barre de progression améliorée */}
                            <div style={{
                              width: '100%',
                              height: isTopThree ? '40px' : '35px',
                              background: '#e0e0e0',
                              borderRadius: '20px',
                              overflow: 'hidden',
                              position: 'relative',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                              <div
                                style={{
                                  width: `${percentage}%`,
                                  height: '100%',
                                  background: getRankColor(rank),
                                  transition: 'width 0.8s ease',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  paddingRight: percentage > 8 ? '15px' : '5px',
                                  color: isTopThree ? 'white' : 'white',
                                  fontSize: isTopThree ? '14px' : '12px',
                                  fontWeight: '700',
                                  boxShadow: isTopThree ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                                  position: 'relative'
                                }}
                              >
                                {percentage > 8 && (
                                  <span style={{ 
                                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                    zIndex: 1
                                  }}>
                                    {percentage.toFixed(0)}%
                                  </span>
                                )}
                                {isTopThree && percentage <= 8 && (
                                  <span style={{ 
                                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                    zIndex: 1,
                                    fontSize: '12px'
                                  }}>
                                    {votes}
                                  </span>
                                )}
                              </div>
                              {percentage <= 8 && !isTopThree && (
                                <div style={{
                                  position: 'absolute',
                                  right: '10px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  color: '#999',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}>
                                  {percentage.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  }
                </div>
              )}
            </div>
            ))
          ) : (
            <p style={{ color: '#999', fontStyle: 'italic', padding: '20px' }}>
              Aucune statistique disponible pour le moment.
            </p>
          )}
        </div>


        <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
          <button
            onClick={handleLeaveSession}
            className="button"
            style={{
              background: 'linear-gradient(135deg, #f5576c 0%, #f093fb 100%)',
              flex: 1
            }}
          >
            🚪 Quitter la session
          </button>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="button"
            style={{ flex: 1 }}
          >
            🔄 Nouveau Sondage
          </button>
        </div>
      </div>
    );
  }

  // Si on est en mode spectateur mais qu'on n'affiche pas encore les résultats, afficher un message
  if (isSpectator && !showResults) {
    return (
      <div className="container">
        <div style={{
          background: 'linear-gradient(135deg, #ffd89b 0%, #19547b 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '15px',
          textAlign: 'center',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>👁️</div>
          <h1 style={{ color: 'white', marginBottom: '15px' }}>Session Terminée</h1>
          <p style={{ fontSize: '16px', opacity: 0.9, marginBottom: '20px' }}>
            Cette session est déjà terminée. Les résultats seront affichés sous peu.
          </p>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>
            Vous êtes en mode spectateur et ne serez pas comptabilisé comme participant.
          </p>
        </div>
      </div>
    );
  }

  // Écran de question
  const timerDuration = 10; // Durée totale du timer en secondes

  return (
    <>
      {/* Compte à rebours fixe en haut à droite de l'écran */}
      {questionTimer !== null && questionTimer > 0 && (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 9999,
          padding: '8px 16px',
          borderRadius: '8px',
          backgroundColor: questionTimer <= 3 ? '#f44336' : questionTimer <= 5 ? '#ff9800' : '#4caf50',
          color: 'white',
          fontSize: '24px',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          transition: 'background-color 0.3s ease',
          // Assurer la visibilité sur iPhone avec safe-area-inset
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
        }}>
          {questionTimer}
        </div>
      )}

      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1>📊 Beihang Sondage</h1>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
            <div style={{ fontSize: '14px', color: '#666' }}>
              Session: <strong style={{ fontFamily: 'monospace' }}>{sessionId}</strong>
            </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(sessionId);
                alert('ID de session copié !');
              }}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                background: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              📋 Copier
            </button>
            <button
              onClick={handleLeaveSession}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                background: '#ffebee',
                border: '1px solid #f44336',
                borderRadius: '5px',
                cursor: 'pointer',
                color: '#c62828'
              }}
            >
              🚪 Quitter
            </button>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="success">
          Vous êtes l&apos;administrateur. Vous pouvez contrôler le sondage.
        </div>
      )}

      {currentQuestion ? (
        <>
          <div style={{ marginBottom: '30px' }}>
            <h2>
              Question {currentQuestion.id}/{questions.length}
            </h2>
            <p style={{ fontSize: '18px', marginTop: '10px' }}>{currentQuestion.question}</p>
          </div>

          <div>
            {currentQuestion.type === 'ranking' ? (
              <div>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
                  Utilisez les flèches pour réorganiser les options dans l&apos;ordre souhaité :
                </p>
                {rankingOrder.map((optionIndex, displayIndex) => {
                  const moveUp = () => {
                    if (displayIndex > 0 && !hasAnswered && !isSpectator) {
                      const newOrder = [...rankingOrder];
                      [newOrder[displayIndex - 1], newOrder[displayIndex]] = [newOrder[displayIndex], newOrder[displayIndex - 1]];
                      setRankingOrder(newOrder);
                    }
                  };
                  
                  const moveDown = () => {
                    if (displayIndex < rankingOrder.length - 1 && !hasAnswered && !isSpectator) {
                      const newOrder = [...rankingOrder];
                      [newOrder[displayIndex], newOrder[displayIndex + 1]] = [newOrder[displayIndex + 1], newOrder[displayIndex]];
                      setRankingOrder(newOrder);
                    }
                  };

                  return (
                    <div
                      key={optionIndex}
                      draggable={!hasAnswered && !isSpectator}
                      onDragStart={(e) => {
                        if (!hasAnswered && !isSpectator) {
                          e.dataTransfer.setData('text/plain', String(displayIndex));
                        }
                      }}
                      onDragOver={(e) => {
                        if (!hasAnswered && !isSpectator) {
                          e.preventDefault();
                        }
                      }}
                      onDrop={(e) => {
                        if (!hasAnswered && !isSpectator) {
                          e.preventDefault();
                          const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                          const newOrder = [...rankingOrder];
                          const [removed] = newOrder.splice(draggedIndex, 1);
                          newOrder.splice(displayIndex, 0, removed);
                          setRankingOrder(newOrder);
                        }
                      }}
                      className={`quiz-option ${hasAnswered ? '' : 'ranking-item'}`}
                      style={{
                        cursor: hasAnswered ? 'default' : 'move',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px',
                        marginBottom: '10px',
                        padding: '15px',
                        background: '#f9f9f9',
                        border: '2px solid #e0e0e0',
                      }}
                    >
                      <span style={{
                        background: '#667eea',
                        color: 'white',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: '600',
                        flexShrink: 0
                      }}>
                        {displayIndex + 1}
                      </span>
                      <span style={{ flex: 1 }}>{getOptionText(currentQuestion.options[optionIndex])}</span>
                      {!hasAnswered && !isSpectator && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                          <button
                            onClick={moveUp}
                            disabled={displayIndex === 0}
                            style={{
                              background: displayIndex === 0 ? '#e0e0e0' : '#667eea',
                              color: displayIndex === 0 ? '#999' : 'white',
                              border: 'none',
                              borderRadius: '4px',
                              width: '36px',
                              height: '36px',
                              fontSize: '20px',
                              cursor: displayIndex === 0 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              touchAction: 'manipulation', // Améliore la réactivité sur mobile
                              WebkitTapHighlightColor: 'transparent', // Retire le highlight sur iOS
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation(); // Empêche le drag sur mobile
                            }}
                          >
                            ▲
                          </button>
                          <button
                            onClick={moveDown}
                            disabled={displayIndex === rankingOrder.length - 1}
                            style={{
                              background: displayIndex === rankingOrder.length - 1 ? '#e0e0e0' : '#667eea',
                              color: displayIndex === rankingOrder.length - 1 ? '#999' : 'white',
                              border: 'none',
                              borderRadius: '4px',
                              width: '36px',
                              height: '36px',
                              fontSize: '20px',
                              cursor: displayIndex === rankingOrder.length - 1 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              touchAction: 'manipulation', // Améliore la réactivité sur mobile
                              WebkitTapHighlightColor: 'transparent', // Retire le highlight sur iOS
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation(); // Empêche le drag sur mobile
                            }}
                          >
                            ▼
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : currentQuestion.type === 'pairing' ? (
              <div>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px', fontStyle: 'italic' }}>
                  Associez les personnes en couples. Cliquez sur deux personnes pour créer un couple. Si le nombre est impair, une personne restera seule.
                </p>
                
                {/* Afficher les couples créés */}
                {pairingSelection.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                              <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#333' }}>Couples créés ({pairingSelection.length}) :</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {pairingSelection.map((couple, idx) => {
                        const [firstIdx, secondIdx] = couple;
                        return (
                          <div
                            key={idx}
                            style={{
                              padding: '10px 15px',
                              background: '#e8f5e9',
                              borderRadius: '8px',
                              border: '2px solid #4caf50',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px'
                            }}
                          >
                            <span style={{ color: '#2e7d32', fontWeight: '600' }}>
                              {getOptionText(currentQuestion.options[firstIdx])} & {getOptionText(currentQuestion.options[secondIdx])}
                            </span>
                            {!hasAnswered && !isSpectator && (
                              <button
                                onClick={() => {
                                  const newPairs = pairingSelection.filter((_, i) => i !== idx);
                                  setPairingSelection(newPairs);
                                  setPairingTempSelection(null);
                                }}
                                style={{
                                  background: '#f44336',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Liste des personnes disponibles */}
                <div>
                  <h3 style={{ fontSize: '16px', marginBottom: '15px', color: '#333' }}>
                    Personnes disponibles :
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                    {currentQuestion.options.map((option: string | Option, index: number) => {
                      // Vérifier si cette personne est déjà dans un couple
                      const isInCouple = pairingSelection.some(([a, b]) => a === index || b === index);
                      
                      return (
                        <div
                          key={index}
                          className={`quiz-option ${isInCouple ? 'selected' : pairingTempSelection === index ? 'selected' : ''}`}
                          onClick={() => {
                            if (!hasAnswered && !isSpectator) {
                              // Si la personne est déjà dans un couple, ne rien faire
                              if (isInCouple) return;
                              
                              if (pairingTempSelection === null) {
                                // Première sélection
                                setPairingTempSelection(index);
                              } else if (pairingTempSelection === index) {
                                // Désélectionner
                                setPairingTempSelection(null);
                              } else {
                                // Deuxième sélection - créer le couple
                                const newCouple: [number, number] = pairingTempSelection < index 
                                  ? [pairingTempSelection, index] 
                                  : [index, pairingTempSelection];
                                // Vérifier qu'on n'a pas déjà ce couple
                                const coupleExists = pairingSelection.some(([a, b]) => 
                                  (a === newCouple[0] && b === newCouple[1])
                                );
                                if (!coupleExists) {
                                  setPairingSelection([...pairingSelection, newCouple]);
                                }
                                setPairingTempSelection(null);
                              }
                            }
                          }}
                          style={{
                            opacity: isInCouple ? 0.6 : pairingTempSelection === index ? 0.8 : 1,
                            cursor: isInCouple ? 'not-allowed' : 'pointer',
                            background: isInCouple ? '#c8e6c9' : pairingTempSelection === index ? '#fff9c4' : undefined,
                            border: pairingTempSelection === index ? '3px solid #fbc02d' : undefined
                          }}
                        >
                          {getOptionText(option)}
                          {isInCouple && <span style={{ marginLeft: '5px', fontSize: '12px' }}>✓</span>}
                          {pairingTempSelection === index && <span style={{ marginLeft: '5px', fontSize: '12px' }}>👆</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {pairingTempSelection !== null && (
                  <div style={{
                    marginTop: '15px',
                    padding: '10px',
                    background: '#fff9c4',
                    borderRadius: '8px',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#f57f17'
                  }}>
                    👆 Première personne sélectionnée : <strong>{getOptionText(currentQuestion.options[pairingTempSelection])}</strong>. Cliquez sur une autre personne pour créer le couple.
                  </div>
                )}
              </div>
            ) : currentQuestion.type === 'categorization' ? (
              <div>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px', fontStyle: 'italic' }}>
                  Classez chaque personne dans l&apos;une des deux catégories :
                </p>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '15px', 
                  marginBottom: '20px',
                  padding: '15px',
                  background: '#f5f5f5',
                  borderRadius: '8px'
                }}>
                  <div style={{ textAlign: 'center', padding: '10px', background: '#e3f2fd', borderRadius: '8px' }}>
                    <div style={{ fontWeight: '600', fontSize: '16px', color: '#1976d2', marginBottom: '5px' }}>
                      {currentQuestion.categoryA || 'Catégorie A'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                    <div style={{ fontWeight: '600', fontSize: '16px', color: '#f57c00', marginBottom: '5px' }}>
                      {currentQuestion.categoryB || 'Catégorie B'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {currentQuestion.options.map((option: string | Option, personIndex: number) => {
                    const category = categorizationAnswers[personIndex]; // 0 = catégorie A, 1 = catégorie B
                    return (
                      <div
                        key={personIndex}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '15px',
                          padding: '15px',
                          background: category === 0 ? '#e3f2fd' : category === 1 ? '#fff3e0' : '#f9f9f9',
                          border: `2px solid ${category === 0 ? '#2196f3' : category === 1 ? '#ff9800' : '#e0e0e0'}`,
                          borderRadius: '8px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ flex: 1, fontWeight: '500' }}>
                          {getOptionText(option)}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => {
                              // #region agent log
                              fetch('http://127.0.0.1:7244/ingest/56000035-2b1e-4b09-8741-9c55323fd7ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:4946',message:'Clic catégorie A',data:{personIndex,hasAnswered,isSpectator,currentAnswers:categorizationAnswers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                              // #endregion
                              if (!hasAnswered && !isSpectator) {
                                setCategorizationAnswers({
                                  ...categorizationAnswers,
                                  [personIndex]: 0
                                });
                              }
                            }}
                            disabled={hasAnswered || isSpectator}
                            style={{
                              padding: '8px 16px',
                              background: category === 0 ? '#2196f3' : '#e0e0e0',
                              color: category === 0 ? 'white' : '#666',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: hasAnswered || isSpectator ? 'not-allowed' : 'pointer',
                              fontWeight: category === 0 ? '600' : 'normal',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {currentQuestion.categoryA || 'Catégorie A'}
                          </button>
                          <button
                            onClick={() => {
                              // #region agent log
                              fetch('http://127.0.0.1:7244/ingest/56000035-2b1e-4b09-8741-9c55323fd7ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:4969',message:'Clic catégorie B',data:{personIndex,hasAnswered,isSpectator,currentAnswers:categorizationAnswers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                              // #endregion
                              if (!hasAnswered && !isSpectator) {
                                setCategorizationAnswers({
                                  ...categorizationAnswers,
                                  [personIndex]: 1
                                });
                              }
                            }}
                            disabled={hasAnswered || isSpectator}
                            style={{
                              padding: '8px 16px',
                              background: category === 1 ? '#ff9800' : '#e0e0e0',
                              color: category === 1 ? 'white' : '#666',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: hasAnswered || isSpectator ? 'not-allowed' : 'pointer',
                              fontWeight: category === 1 ? '600' : 'normal',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {currentQuestion.categoryB || 'Catégorie B'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              currentQuestion.options.map((option: string | Option, index: number) => (
                <div
                  key={index}
                  className={`quiz-option ${
                    selectedAnswer === index ? 'selected' : ''
                  }`}
                  onClick={() => !hasAnswered && !isSpectator && setSelectedAnswer(index)}
                >
                  {getOptionText(option)}
                </div>
              ))
            )}
          </div>

          {!hasAnswered && !isSpectator && (() => {
            // #region agent log
            const isDisabled = currentQuestion.type === 'ranking' 
              ? rankingOrder.length === 0 || rankingOrder.length !== currentQuestion.options.length
              : currentQuestion.type === 'pairing'
              ? pairingSelection.length === 0
              : currentQuestion.type === 'categorization'
              ? !currentQuestion.options.every((_: any, index: number) => categorizationAnswers[index] === 0 || categorizationAnswers[index] === 1)
              : selectedAnswer === null;
            if (currentQuestion.type === 'categorization') {
              fetch('http://127.0.0.1:7244/ingest/56000035-2b1e-4b09-8741-9c55323fd7ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/page.tsx:5016',message:'Évaluation disabled bouton',data:{isDisabled,optionsLength:currentQuestion.options?.length,optionsIsArray:Array.isArray(currentQuestion.options),categorizationAnswers,everyResult:currentQuestion.options?.map((_: any, index: number) => ({index,hasAnswer:categorizationAnswers[index] === 0 || categorizationAnswers[index] === 1}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            }
            // #endregion
            return (
              <button 
                onClick={handleSubmitAnswer}
                className="button" 
                disabled={isDisabled}
              >
                Soumettre la réponse
              </button>
            );
          })()}
          {isSpectator && (
            <div style={{
              padding: '15px',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '10px',
              textAlign: 'center',
              color: '#856404',
              marginTop: '20px'
            }}>
              👁️ Vous êtes en mode spectateur. Vous ne pouvez pas répondre aux questions.
            </div>
          )}

          {hasAnswered && (
            <div className="success" style={{ marginTop: '20px' }}>
              Réponse enregistrée ! En attente de la prochaine question...
            </div>
          )}

          {/* Bouton admin pour passer à la question suivante ou voir les résultats */}
          {isAdmin && (
            <div style={{ marginTop: '20px' }}>
              {questionTimer === null || questionTimer <= 0 ? (
                (() => {
                  // Déterminer si on est sur la dernière question
                  const isLastQuestion = currentQuestionIndex >= 0 && currentQuestionIndex === questions.length - 1;
                  return (
                    <button
                      onClick={isLastQuestion ? handleViewResults : handleNextQuestion}
                      className="button"
                      style={{
                        background: isLastQuestion 
                          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                      }}
                    >
                      {isLastQuestion ? 'Voir les résultats' : 'Question suivante'}
                    </button>
                  );
                })()
              ) : null}
            </div>
          )}
        </>
      ) : (
        <div className="loading">
          <h2>En attente du début du sondage...</h2>
          <div style={{ 
            background: '#f5f5f5', 
            padding: '20px', 
            borderRadius: '10px', 
            marginTop: '20px' 
          }}>
            <h3 style={{ marginBottom: '15px', color: '#333' }}>
              Participants connectés: {participants.length}
            </h3>
            {participants.length > 0 ? (
              <div style={{ marginTop: '10px' }}>
                {participants.map((p, index) => (
                  <div 
                    key={p.id} 
                    style={{ 
                      padding: '10px', 
                      margin: '5px 0',
                      background: 'white',
                      borderRadius: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>👤</span>
                    <strong>{p.id}</strong>
                    {p.id === name && <span style={{ color: '#667eea', fontSize: '12px' }}>(Vous)</span>}
                    {isAdmin && p.id === name && <span style={{ color: '#f5576c', fontSize: '12px' }}>👑 Admin</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#999', fontStyle: 'italic' }}>
                Aucun participant pour le moment...
              </p>
            )}
          </div>
          {/* Bouton pour copier le lien de partage */}
          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '10px',
            color: 'white'
          }}>
            <div style={{ marginBottom: '10px', fontWeight: '600', fontSize: '16px' }}>
              🔗 Inviter d&apos;autres participants
            </div>
            <p style={{ marginBottom: '15px', fontSize: '14px', opacity: 0.9 }}>
              Partagez ce lien pour inviter d&apos;autres personnes à rejoindre la session :
            </p>
            <div style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              <input
                type="text"
                readOnly
                value={getShareLink(sessionId)}
                style={{
                  flex: 1,
                  minWidth: '200px',
                  padding: '10px',
                  borderRadius: '5px',
                  border: 'none',
                  fontSize: '14px',
                  background: 'rgba(255, 255, 255, 0.95)',
                  color: '#333'
                }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => copyShareLink(sessionId)}
                style={{
                  padding: '10px 20px',
                  background: 'white',
                  color: '#667eea',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}
              >
                📋 Copier le lien
              </button>
            </div>
          </div>
          {isAdmin && (
            <button onClick={handleStartSurvey} className="button" style={{ marginTop: '20px' }}>
              🚀 Lancer le sondage
            </button>
          )}
          <button
            onClick={handleLeaveSession}
            className="button"
            style={{
              marginTop: '20px',
              background: 'linear-gradient(135deg, #f5576c 0%, #f093fb 100%)',
            }}
          >
            🚪 Quitter la session
          </button>
          <div style={{ 
            marginTop: '20px', 
            padding: '10px', 
            background: '#fff3cd', 
            borderRadius: '5px',
            fontSize: '12px',
            color: '#856404'
          }}>
            💡 Astuce: Ouvrez la console du navigateur (F12) pour voir les logs de débogage Firebase
          </div>
        </div>
      )}
      
      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        onConfirm={modalState.onConfirm}
      />
    </div>
    </>
  );
}

