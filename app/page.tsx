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

// Fonction helper pour obtenir l'image d'une option
const getOptionImage = (option: string | Option): string | undefined => {
  if (typeof option === 'string') {
    return undefined;
  }
  return option.image;
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
    allOptions?: (string | Option)[];
  } | null>(null);
  const [lastAnimatedResultIndex, setLastAnimatedResultIndex] = useState<number>(-1); // Pour éviter de rejouer l'animation pour le même résultat
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(-1); // Index de la question actuelle depuis Firestore
  const router = useRouter();
  const hasCheckedLocalStorage = useRef(false); // Pour éviter les vérifications multiples du localStorage
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null); // Référence pour l'intervalle du timer
  
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
                stats.totalVotes++;
                
                // answer[position] = optionIndex
                answer.forEach((optionIndex: number, position: number) => {
                  if (!optionPositions[optionIndex]) {
                    optionPositions[optionIndex] = [];
                  }
                  optionPositions[optionIndex].push(position);
                });
              }
            }
          });
          
          // Calculer la moyenne des positions pour chaque option
          stats.rankingAverages = {};
          Object.keys(optionPositions).forEach((optionIndexStr) => {
            const optionIndex = parseInt(optionIndexStr);
            const positions = optionPositions[optionIndex];
            const sum = positions.reduce((acc, pos) => acc + pos, 0);
            const average = positions.length > 0 ? sum / positions.length : 0;
            stats.rankingAverages[optionIndex] = {
              average: average,
              count: positions.length
            };
          });
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
        
        // Vérifier si l'utilisateur a déjà répondu
        if (name && name.trim() !== '') {
          const participantRef = doc(db, 'sessions', sid, 'participants', name);
          try {
            const participantDoc = await getDoc(participantRef);
            if (participantDoc.exists()) {
              const answers = participantDoc.data().answers || {};
              if (answers[questionIndex] !== undefined) {
                setHasAnswered(true);
                if (question.type === 'ranking' && Array.isArray(answers[questionIndex])) {
                  setRankingOrder(answers[questionIndex]);
                } else {
                  setSelectedAnswer(answers[questionIndex]);
                }
              } else {
                setHasAnswered(false);
                setSelectedAnswer(null);
                if (question.type === 'ranking') {
                  const initialOrder = question.options.map((_: any, index: number) => index);
                  setRankingOrder(initialOrder);
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
        const timerEndTime = data.questionTimerEndTime;
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
        if (remaining > 0) {
          setQuestionTimer(remaining);
          // Mettre à jour le timer toutes les 100ms pour un affichage fluide
          timerIntervalRef.current = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((timerEndTime - now) / 1000));
            if (remaining > 0) {
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

  // Détecter le gagnant et déclencher l'animation pour les questions multiple-choice
  useEffect(() => {
    if (!showResults || !resultsMode || currentResultIndex < 0 || !questionStats || questionStats.length === 0) {
      return;
    }

    // Ne pas déclencher l'animation si elle est déjà en cours ou si on a déjà animé ce résultat
    if (showRevealAnimation || lastAnimatedResultIndex === currentResultIndex) {
      return;
    }

    const currentStat = questionStats[currentResultIndex];
    if (!currentStat || currentStat.type !== 'multiple-choice') {
      // Pour les questions de type ranking, ne pas afficher d'animation
      return;
    }

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
      const winnerName = getOptionText(winnerOption);
      const winnerImage = getOptionImage(winnerOption);

      // Déclencher l'animation pour ce nouveau résultat
      setRevealAnimationData({
        question: currentStat.question,
        winnerName,
        winnerImage,
        allOptions: currentStat.options || [],
      });
      setShowRevealAnimation(true);
      setLastAnimatedResultIndex(currentResultIndex);
    }
  }, [showResults, resultsMode, currentResultIndex, questionStats, showRevealAnimation, lastAnimatedResultIndex]);

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
      
      // Réinitialiser l'animation pour qu'elle se rejoue pour le nouveau résultat
      setShowRevealAnimation(false);
      setRevealAnimationData(null);
      setLastAnimatedResultIndex(-1); // Réinitialiser pour permettre l'animation du nouveau résultat
      
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
      
      // Réinitialiser l'animation pour qu'elle se rejoue pour le résultat précédent
      setShowRevealAnimation(false);
      setRevealAnimationData(null);
      setLastAnimatedResultIndex(-1); // Réinitialiser pour permettre l'animation du résultat précédent
      
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

      const questionIndex = currentQuestion.id - 1;
      const answer = currentQuestion.type === 'ranking' ? rankingOrder : selectedAnswer;
      answers[questionIndex] = answer;

      // Pas de scoring pour les sondages
      let newScore = currentScore;

      await updateDoc(participantRef, {
        answers,
        score: newScore,
      });

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
          // Plus de participants, supprimer la session
          console.log('🗑️ Plus de participants, suppression de la session');
          
          // Supprimer tous les participants d'abord (y compris celui qui quitte)
          for (const participant of allParticipants) {
            const partRef = doc(db, 'sessions', sessionId, 'participants', participant.id);
            await deleteDoc(partRef);
            if (participant.id === name) {
              participantAlreadyDeleted = true;
            }
          }
          
          // Supprimer la session
          await deleteDoc(sessionRef);
          console.log('✅ Session supprimée');
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
    if (showRevealAnimation && revealAnimationData) {
      return (
        <RevealAnimation
          question={revealAnimationData.question}
          winnerName={revealAnimationData.winnerName}
          winnerImage={revealAnimationData.winnerImage}
          allOptions={revealAnimationData.allOptions}
          onComplete={() => {
            setShowRevealAnimation(false);
            setRevealAnimationData(null);
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
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={handlePreviousResult}
                  disabled={currentResultIndex <= 0}
                  className="button"
                  style={{
                    background: currentResultIndex <= 0
                      ? '#ccc'
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    cursor: currentResultIndex <= 0 ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    padding: '15px 30px',
                    fontWeight: '600'
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
                    fontSize: '16px',
                    padding: '15px 30px',
                    fontWeight: '600'
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
                      📊 Total de votes: <span style={{ color: '#667eea', fontSize: '18px' }}>{currentStat.totalVotes}</span>
                    </p>
                  </div>
                  
                  {currentStat.options && Array.isArray(currentStat.options) && 
                    currentStat.options
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
                        
                        const isTopThree = rank < 3;
                        
                        return (
                          <div 
                            key={optionIndex} 
                            style={{ 
                              marginBottom: isTopThree ? '20px' : '15px',
                              padding: isTopThree ? '18px' : '15px',
                              background: isTopThree ? '#f9f9f9' : 'white',
                              borderRadius: '12px',
                              border: isTopThree ? `3px solid ${rank === 0 ? '#FFD700' : rank === 1 ? '#C0C0C0' : '#CD7F32'}` : '1px solid #e0e0e0',
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
                      })
                  }
                </div>
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
  const progressPercentage = questionTimer !== null && questionTimer > 0 
    ? ((timerDuration - questionTimer) / timerDuration) * 100 
    : 0;

  return (
    <>
      {/* Barre de progression fixe en haut de l'écran */}
      {questionTimer !== null && questionTimer > 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '6px',
          backgroundColor: '#e0e0e0',
          zIndex: 9999,
          width: '100%'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercentage}%`,
            backgroundColor: questionTimer <= 3 ? '#f44336' : questionTimer <= 5 ? '#ff9800' : '#4caf50',
            transition: 'width 0.1s linear, background-color 0.3s ease',
            borderRadius: '0 3px 3px 0'
          }} />
        </div>
      )}

      <div className="container" style={{
        paddingTop: questionTimer !== null && questionTimer > 0 ? '6px' : '0'
      }}>
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
                  Cliquez et glissez pour réorganiser les options dans l&apos;ordre souhaité :
                </p>
                {rankingOrder.map((optionIndex, displayIndex) => (
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
                    {!hasAnswered && <span style={{ color: '#999', fontSize: '18px' }}>⋮⋮</span>}
                  </div>
                ))}
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

          {!hasAnswered && !isSpectator && (
            <button 
              onClick={handleSubmitAnswer}
              className="button" 
              disabled={
                currentQuestion.type === 'ranking' 
                  ? rankingOrder.length === 0 || rankingOrder.length !== currentQuestion.options.length
                  : selectedAnswer === null
              }
            >
              Soumettre la réponse
            </button>
          )}
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

