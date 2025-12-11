'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function Home() {
  const [name, setName] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState(''); // Input pour l'ID de session
  const [sessionId, setSessionId] = useState(''); // ID de session actuel (une fois connecté)
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [questionTimer, setQuestionTimer] = useState<number | null>(null); // Compte à rebours entre questions
  const router = useRouter();

  // Questions du quiz
  const questions = [
    {
      id: 1,
      question: 'Quelle est la capitale de la France ?',
      options: ['Lyon', 'Marseille', 'Paris', 'Toulouse'],
      correct: 2,
    },
    {
      id: 2,
      question: 'Quel est le plus grand océan ?',
      options: ['Atlantique', 'Pacifique', 'Indien', 'Arctique'],
      correct: 1,
    },
    {
      id: 3,
      question: 'Combien de continents y a-t-il sur Terre ?',
      options: ['5', '6', '7', '8'],
      correct: 2,
    },
    {
      id: 4,
      question: 'Quel est le langage de programmation le plus populaire ?',
      options: ['Python', 'JavaScript', 'Java', 'C++'],
      correct: 1,
    },
    {
      id: 5,
      question: 'Quelle est la vitesse de la lumière ?',
      options: ['300 000 km/s', '150 000 km/s', '450 000 km/s', '600 000 km/s'],
      correct: 0,
    },
  ];

  // Créer ou rejoindre une session
  const handleJoin = async () => {
    if (!name.trim()) {
      alert('Veuillez entrer votre nom');
      return;
    }

    // Valider l'ID de session si fourni (doit être uniquement numérique)
    if (sessionIdInput.trim() && !/^\d+$/.test(sessionIdInput.trim())) {
      alert('L\'ID de session doit être uniquement un nombre (ex: 1234567890)');
      return;
    }

    // Déterminer l'ID de session : utiliser l'input si fourni, sinon créer un nouveau (juste un nombre)
    const finalSessionId = sessionIdInput.trim() || String(Date.now());
    const isNewSession = !sessionIdInput.trim();

    console.log('🔗 Tentative de connexion:', {
      name,
      sessionIdInput,
      finalSessionId,
      isNewSession,
    });

    try {
      const sessionRef = doc(db, 'sessions', finalSessionId);
      const sessionDoc = await getDoc(sessionRef);

      console.log('📄 État de la session:', {
        exists: sessionDoc.exists(),
        isNewSession,
        finalSessionId,
      });

      // Si on essaie de rejoindre une session qui n'existe pas
      if (!sessionDoc.exists() && !isNewSession) {
        alert('Session introuvable. Vérifiez l\'ID de session.');
        console.error('❌ Session introuvable:', finalSessionId);
        return;
      }

      // Créer la session si elle n'existe pas
      if (!sessionDoc.exists()) {
        console.log('🆕 Création d\'une nouvelle session:', finalSessionId);
        await setDoc(sessionRef, {
          currentQuestionIndex: -1,
          isActive: true,
          createdAt: new Date(),
          adminName: name,
        });
        setIsAdmin(true);
        console.log('✅ Session créée, vous êtes l\'administrateur');
      } else {
        // Rejoindre une session existante
        console.log('👋 Rejoindre une session existante:', finalSessionId);
        const sessionData = sessionDoc.data();
        if (sessionData?.adminName === name) {
          setIsAdmin(true);
          console.log('✅ Vous êtes l\'administrateur de cette session');
        } else {
          setIsAdmin(false);
          console.log('👤 Vous rejoignez en tant que participant');
        }
      }

      // Ajouter le participant (écrase si déjà présent avec le même nom)
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
        alert('Erreur: Impossible d\'ajouter le participant à la base de données');
        return;
      }

      // Mettre à jour l'état et le localStorage
      setSessionId(finalSessionId);
      localStorage.setItem('sessionId', finalSessionId);
      localStorage.setItem('participantName', name);
      localStorage.setItem('isAdmin', String(isAdmin || sessionDoc.data()?.adminName === name));

      // Écouter les changements de session
      console.log('👂 Démarrage de l\'écoute pour la session:', finalSessionId);
      listenToSession(finalSessionId);
    } catch (error) {
      console.error('❌ Erreur lors de la connexion:', error);
      alert('Erreur lors de la connexion: ' + (error as Error).message);
    }
  };

  // Charger les résultats finaux
  const loadFinalResults = useCallback(async (sid: string) => {
    const participantsRef = collection(db, 'sessions', sid, 'participants');
    const snapshot = await getDocs(participantsRef);
    const parts: any[] = [];
    snapshot.forEach((doc) => {
      parts.push({ id: doc.id, ...doc.data() });
    });
    setResults(parts.sort((a, b) => b.score - a.score));
    setShowResults(true);
  }, []);

  // Écouter les changements de session
  const listenToSession = useCallback((sid: string) => {
    const sessionRef = doc(db, 'sessions', sid);
    
    onSnapshot(sessionRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      const questionIndex = data.currentQuestionIndex;
      
      if (questionIndex >= 0 && questionIndex < questions.length) {
        setCurrentQuestion(questions[questionIndex]);
        setShowResults(false);
        setQuestionTimer(null); // Réinitialiser le timer pour la nouvelle question
        
        // Vérifier si l'utilisateur a déjà répondu
        const participantRef = doc(db, 'sessions', sid, 'participants', name);
        const participantDoc = await getDoc(participantRef);
        if (participantDoc.exists()) {
          const answers = participantDoc.data().answers || {};
          if (answers[questionIndex] !== undefined) {
            setHasAnswered(true);
            setSelectedAnswer(answers[questionIndex]);
          } else {
            setHasAnswered(false);
            setSelectedAnswer(null);
          }
        }
      } else if (questionIndex === questions.length) {
        // Afficher les résultats finaux
        setQuestionTimer(null);
        await loadFinalResults(sid);
      }
    });

    // Écouter les participants
    const participantsRef = collection(db, 'sessions', sid, 'participants');
    console.log('👂 Écoute des participants pour la session:', sid);
    onSnapshot(participantsRef, (snapshot) => {
      console.log('📊 Participants mis à jour:', snapshot.size, 'participant(s)');
      const parts: any[] = [];
      snapshot.forEach((doc) => {
        console.log('  - Participant:', doc.id, doc.data());
        parts.push({ id: doc.id, ...doc.data() });
      });
      setParticipants(parts.sort((a, b) => b.score - a.score));
      console.log('✅ Liste des participants mise à jour:', parts.map(p => p.id));
    }, (error) => {
      console.error('❌ Erreur lors de l\'écoute des participants:', error);
    });
  }, [name, loadFinalResults]);


  // Soumettre une réponse
  const handleSubmitAnswer = async () => {
    if (selectedAnswer === null || !sessionId) return;

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
      answers[questionIndex] = selectedAnswer;

      // Vérifier si la réponse est correcte
      let newScore = currentScore;
      if (selectedAnswer === currentQuestion.correct) {
        newScore += 1;
      }

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

  // Admin: Passer à la question suivante avec délai de 10 secondes
  const handleNextQuestion = async () => {
    if (!sessionId || !isAdmin) return;
    if (questionTimer !== null && questionTimer > 0) return; // Empêcher si timer actif

    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      const currentIndex = sessionDoc.data()?.currentQuestionIndex || -1;
      
      // Démarrer le timer de 10 secondes
      setQuestionTimer(10);
      
      // Mettre à jour l'index de la question
      await updateDoc(sessionRef, {
        currentQuestionIndex: currentIndex + 1,
      });

      // Timer de compte à rebours
      const interval = setInterval(() => {
        setQuestionTimer((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Erreur:', error);
      setQuestionTimer(null);
    }
  };

  // Fonction pour quitter la session
  const handleLeaveSession = async () => {
    if (!sessionId || !name) return;

    const confirmLeave = window.confirm('Êtes-vous sûr de vouloir quitter la session ?');
    if (!confirmLeave) return;

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
          
          // Supprimer tous les participants d'abord
          for (const participant of allParticipants) {
            const partRef = doc(db, 'sessions', sessionId, 'participants', participant.id);
            await deleteDoc(partRef);
          }
          
          // Supprimer la session
          await deleteDoc(sessionRef);
          console.log('✅ Session supprimée');
        }
      }

      // Supprimer le participant de Firestore
      console.log('🗑️ Suppression du participant:', name);
      await deleteDoc(participantRef);
      console.log('✅ Participant supprimé de Firestore');

      // Nettoyer le localStorage
      localStorage.removeItem('sessionId');
      localStorage.removeItem('participantName');
      localStorage.removeItem('isAdmin');
      console.log('✅ LocalStorage nettoyé');

      // Réinitialiser tous les états
      setSessionId('');
      setName('');
      setSessionIdInput('');
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
      alert('Erreur lors de la sortie: ' + (error as Error).message);
    }
  };

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const savedSessionId = localStorage.getItem('sessionId');
    const savedName = localStorage.getItem('participantName');
    const savedIsAdmin = localStorage.getItem('isAdmin') === 'true';

    if (savedSessionId && savedName) {
      setSessionId(savedSessionId);
      setName(savedName);
      setIsAdmin(savedIsAdmin);
      listenToSession(savedSessionId);
    }
  }, [listenToSession]);

  // Nettoyer le timer quand le composant est démonté
  useEffect(() => {
    return () => {
      setQuestionTimer(null);
    };
  }, []);

  // Écran de connexion
  if (!sessionId) {
    return (
      <div className="container">
        <h1>🎯 Beihang Quiz</h1>
        <div>
          <input
            type="text"
            placeholder="Votre nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
          <input
            type="text"
            placeholder="ID de session (laisser vide pour créer une nouvelle session)"
            value={sessionIdInput}
            onChange={(e) => setSessionIdInput(e.target.value)}
            className="input"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={handleJoin} className="button">
            {sessionIdInput.trim() ? 'Rejoindre la session' : 'Créer une nouvelle session'}
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
        </div>
      </div>
    );
  }

  // Écran de résultats finaux
  if (showResults) {
    return (
      <div className="container">
        <h1>🏆 Résultats Finaux</h1>
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
        <div style={{ marginTop: '30px' }}>
          <h2>Classement</h2>
          {results.map((result, index) => (
            <div
              key={result.id}
              style={{
                padding: '15px',
                margin: '10px 0',
                background: index === 0 ? '#fff9c4' : '#f5f5f5',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>
                  {index + 1}. {result.id}
                  {index === 0 && ' 👑'}
                </strong>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#667eea' }}>
                {result.score}/{questions.length}
              </div>
            </div>
          ))}
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
            🔄 Nouveau Quiz
          </button>
        </div>
      </div>
    );
  }

  // Écran de question
  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>🎯 Beihang Quiz</h1>
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
          Vous êtes l&apos;administrateur. Vous pouvez contrôler le quiz.
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
            {currentQuestion.options.map((option: string, index: number) => (
              <div
                key={index}
                className={`quiz-option ${
                  selectedAnswer === index ? 'selected' : ''
                } ${hasAnswered && index === currentQuestion.correct ? 'correct' : ''} ${
                  hasAnswered &&
                  selectedAnswer === index &&
                  index !== currentQuestion.correct
                    ? 'incorrect'
                    : ''
                }`}
                onClick={() => !hasAnswered && setSelectedAnswer(index)}
              >
                {option}
              </div>
            ))}
          </div>

          {!hasAnswered && (
            <button onClick={handleSubmitAnswer} className="button" disabled={selectedAnswer === null}>
              Soumettre la réponse
            </button>
          )}

          {hasAnswered && (
            <div className="success" style={{ marginTop: '20px' }}>
              Réponse enregistrée ! En attente de la prochaine question...
            </div>
          )}

          {isAdmin && (
            <div style={{ marginTop: '20px' }}>
              {questionTimer !== null && questionTimer > 0 ? (
                <div style={{
                  padding: '15px',
                  background: '#fff3cd',
                  borderRadius: '10px',
                  textAlign: 'center',
                  marginBottom: '10px'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#856404' }}>
                    ⏱️ Prochaine question dans : {questionTimer}s
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="button"
                  style={{
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  }}
                >
                  Question suivante
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="loading">
          <h2>En attente du début du quiz...</h2>
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
          {isAdmin && (
            <button onClick={handleNextQuestion} className="button" style={{ marginTop: '20px' }}>
              Commencer le quiz
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
    </div>
  );
}

