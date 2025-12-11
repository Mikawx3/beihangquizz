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
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [name, setName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
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
    if (!name.trim()) return;

    let finalSessionId = sessionId || `session-${Date.now()}`;
    const isNewSession = !sessionId;

    try {
      const sessionRef = doc(db, 'sessions', finalSessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists() && !isNewSession) {
        alert('Session introuvable');
        return;
      }

      if (!sessionDoc.exists()) {
        // Créer la session
        await setDoc(sessionRef, {
          currentQuestionIndex: -1,
          isActive: true,
          createdAt: new Date(),
          adminName: name,
        });
        setIsAdmin(true);
      } else {
        const sessionData = sessionDoc.data();
        if (sessionData.adminName === name) {
          setIsAdmin(true);
        }
      }

      // Ajouter le participant
      const participantRef = doc(
        db,
        'sessions',
        finalSessionId,
        'participants',
        name
      );
      console.log('📝 Ajout du participant:', name, 'dans la session:', finalSessionId);
      await setDoc(participantRef, {
        name,
        answers: {},
        score: 0,
        joinedAt: new Date(),
      });
      console.log('✅ Participant ajouté avec succès');

      setSessionId(finalSessionId);
      localStorage.setItem('sessionId', finalSessionId);
      localStorage.setItem('participantName', name);
      localStorage.setItem('isAdmin', String(isAdmin || sessionDoc.data()?.adminName === name));

      // Écouter les changements de session
      listenToSession(finalSessionId);
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la connexion');
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

  // Admin: Passer à la question suivante
  const handleNextQuestion = async () => {
    if (!sessionId || !isAdmin) return;

    try {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      const currentIndex = sessionDoc.data()?.currentQuestionIndex || -1;
      
      await updateDoc(sessionRef, {
        currentQuestionIndex: currentIndex + 1,
      });
    } catch (error) {
      console.error('Erreur:', error);
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
            placeholder="ID de session (laisser vide pour créer)"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="input"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={handleJoin} className="button">
            {sessionId ? 'Rejoindre' : 'Créer une session'}
          </button>
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
        <button
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
          className="button"
          style={{ marginTop: '30px' }}
        >
          Nouveau Quiz
        </button>
      </div>
    );
  }

  // Écran de question
  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>🎯 Beihang Quiz</h1>
        <div style={{ fontSize: '14px', color: '#666' }}>
          Session: {sessionId.slice(-8)}
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
            <button
              onClick={handleNextQuestion}
              className="button"
              style={{
                marginTop: '20px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              }}
            >
              Question suivante
            </button>
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

