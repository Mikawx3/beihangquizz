'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

interface Option {
  text: string;
  image?: string;
}

interface Question {
  id: string;
  question: string;
  options: (string | Option)[];
  type?: 'multiple-choice' | 'ranking' | 'pairing' | 'categorization';
  categoryA?: string;
  categoryB?: string;
}

// Fonction helper pour normaliser les options
const normalizeOption = (option: string | Option): Option => {
  if (typeof option === 'string') {
    return { text: option };
  }
  return option;
};

// Fonction helper pour obtenir le texte d'une option
const getOptionText = (option: string | Option): string => {
  if (typeof option === 'string') {
    return option;
  }
  return option.text;
};

export default function SessionResults() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const exportRef = useRef<HTMLDivElement>(null);
  
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [surveyName, setSurveyName] = useState('');

  // Charger les données de la session
  const loadSessionData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Charger la session
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        setError('Session non trouvée');
        setLoading(false);
        return;
      }
      
      const sessionData: any = { id: sessionDoc.id, ...sessionDoc.data() };
      setSession(sessionData);
      
      // Charger les participants
      const participantsRef = collection(db, 'sessions', sessionId, 'participants');
      const participantsSnapshot = await getDocs(participantsRef);
      const loadedParticipants: any[] = [];
      participantsSnapshot.forEach((doc) => {
        loadedParticipants.push({ id: doc.id, ...doc.data() });
      });
      setParticipants(loadedParticipants);
      
      // Charger les questions depuis le sondage
      const surveyId: string | undefined = sessionData?.surveyId;
      if (surveyId) {
        const surveyRef = doc(db, 'surveys', surveyId);
        const surveyDoc = await getDoc(surveyRef);
        
        if (surveyDoc.exists()) {
          setSurveyName(surveyDoc.data().name || surveyId);
        }
        
        const questionsRef = collection(db, 'surveys', surveyId, 'questions');
        const questionsSnapshot = await getDocs(questionsRef);
        const loadedQuestions: Question[] = [];
        questionsSnapshot.forEach((doc) => {
          loadedQuestions.push({ id: doc.id, ...doc.data() } as Question);
        });
        loadedQuestions.sort((a, b) => a.id.localeCompare(b.id));
        setQuestions(loadedQuestions);
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement:', error);
      setError('Erreur lors du chargement des résultats: ' + (error?.message || 'Erreur inconnue'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadSessionData();
    }
  }, [sessionId, loadSessionData]);

  // Calculer les statistiques de votes par question
  const calculateQuestionStats = useCallback(() => {
    if (!participants || participants.length === 0 || !questions || questions.length === 0) {
      return [];
    }
    
    try {
      return questions.map((question: Question, questionIndex: number) => {
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
          const optionPositions: { [key: number]: number[] } = {};
          
          participants.forEach((participant: any) => {
            if (participant && participant.answers && typeof participant.answers === 'object') {
              const answer = participant.answers[questionIndex];
              if (answer !== undefined && answer !== null && Array.isArray(answer)) {
                if (answer.length === question.options.length) {
                  stats.totalVotes++;
                  answer.forEach((optionIndex: number, position: number) => {
                    if (typeof optionIndex === 'number' && optionIndex >= 0 && optionIndex < question.options.length) {
                      if (!optionPositions[optionIndex]) {
                        optionPositions[optionIndex] = [];
                      }
                      optionPositions[optionIndex].push(position);
                    }
                  });
                }
              }
            }
          });
          
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
        } else if (question.type === 'pairing') {
          const coupleVotes: { [key: string]: number } = {};
          
          participants.forEach((participant: any) => {
            if (participant && participant.answers && typeof participant.answers === 'object') {
              const answer = participant.answers[questionIndex];
              if (answer !== undefined && answer !== null && Array.isArray(answer)) {
                if (answer.length > 0 && answer.length % 2 === 0) {
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
                }
              }
            }
          });
          
          stats.coupleVotes = coupleVotes;
        } else if (question.type === 'categorization') {
          const personCategories: { [key: number]: { categoryA: number; categoryB: number } } = {};
          
          question.options.forEach((_: any, index: number) => {
            personCategories[index] = { categoryA: 0, categoryB: 0 };
          });
          
          participants.forEach((participant: any) => {
            if (participant && participant.answers && typeof participant.answers === 'object') {
              const answer = participant.answers[questionIndex];
              if (answer !== undefined && answer !== null && typeof answer === 'object' && !Array.isArray(answer)) {
                stats.totalVotes++;
                
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
          participants.forEach((participant: any) => {
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
  }, [participants, questions]);

  const questionStats = calculateQuestionStats();

  // Fonction d'impression
  const handlePrint = () => {
    window.print();
  };


  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '18px', color: '#666' }}>Chargement des résultats...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <h2 style={{ color: '#f44336', marginBottom: '15px' }}>❌ Erreur</h2>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>{error}</p>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '12px 24px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600'
            }}
          >
            Retour à l&apos;accueil
          </button>
        </div>
      </div>
    );
  }

  const createdAt = session?.createdAt?.toDate?.() || null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '20px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        {/* En-tête avec boutons d'action */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <h1 style={{ color: '#333', margin: 0, fontSize: '28px' }}>📊 Résultats de la Session</h1>
            <p style={{ color: '#666', marginTop: '5px', fontSize: '16px' }}>
              {sessionId} {surveyName && `- ${surveyName}`}
            </p>
            {createdAt && (
              <p style={{ color: '#999', marginTop: '5px', fontSize: '14px' }}>
                Créée le: {createdAt.toLocaleDateString('fr-FR')} à {createdAt.toLocaleTimeString('fr-FR')}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handlePrint}
              style={{
                padding: '12px 24px',
                background: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              🖨️ Imprimer
            </button>
            <button
              onClick={() => router.push(`/results/${sessionId}/details`)}
              style={{
                padding: '12px 24px',
                background: '#9c27b0',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              👥 Voir votes détaillés par personne
            </button>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '12px 24px',
                background: '#f5f5f5',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ← Retour à l&apos;accueil
            </button>
          </div>
        </div>

        {/* Statistiques générales */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          marginBottom: '30px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '20px',
            borderRadius: '15px',
            color: 'white',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
              {participants.length}
            </div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>Participants</div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            padding: '20px',
            borderRadius: '15px',
            color: 'white',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
              {questions.length}
            </div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>Questions</div>
          </div>
        </div>

        {/* Zone exportable pour l'image */}
        <div ref={exportRef} style={{ backgroundColor: 'white' }}>
          {/* Résultats par question - même contenu que la version admin */}
          <div style={{ marginTop: '30px' }}>
            <h2 style={{ color: '#555', marginBottom: '20px', fontSize: '24px' }}>
              📈 Résultats détaillés par question
            </h2>
            
            {questionStats.length === 0 ? (
              <p style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', padding: '40px' }}>
                Aucun résultat disponible pour le moment
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                {questionStats.map((stats: any, index: number) => (
                  <div
                    key={index}
                    style={{
                      background: '#f9f9f9',
                      padding: '25px',
                      borderRadius: '15px',
                      border: '2px solid #e0e0e0',
                      pageBreakInside: 'avoid'
                    }}
                  >
                    <h3 style={{
                      color: '#333',
                      marginBottom: '15px',
                      fontSize: '20px',
                      fontWeight: '600'
                    }}>
                      Question {index + 1}: {stats.question}
                    </h3>
                    
                    <div style={{
                      fontSize: '14px',
                      color: '#666',
                      marginBottom: '20px',
                      padding: '10px',
                      background: '#e3f2fd',
                      borderRadius: '8px'
                    }}>
                      <strong>Type:</strong> {
                        stats.type === 'multiple-choice' ? 'Choix' :
                        stats.type === 'ranking' ? 'Classement / Tri' :
                        stats.type === 'pairing' ? 'Association de couples' :
                        stats.type === 'categorization' ? 'Catégorisation' :
                        'Autre'
                      } | <strong>Total de réponses:</strong> {stats.totalVotes}
                    </div>

                    {/* Résultats selon le type de question - même code que la version admin */}
                    {stats.type === 'multiple-choice' && (
                      <div>
                        {stats.options.map((option: string | Option, optIndex: number) => {
                          const opt = normalizeOption(option);
                          const voteCount = stats.votes[optIndex] || 0;
                          const percentage = stats.totalVotes > 0 
                            ? Math.round((voteCount / stats.totalVotes) * 100) 
                            : 0;
                          const maxVotes = Math.max(...Object.values(stats.votes).map((v: any) => v || 0), 1);
                          
                          return (
                            <div key={optIndex} style={{ marginBottom: '15px' }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '5px'
                              }}>
                                <span style={{ fontWeight: '600', fontSize: '16px' }}>
                                  {optIndex + 1}. {opt.text}
                                </span>
                                <span style={{ color: '#667eea', fontWeight: '600', fontSize: '16px' }}>
                                  {voteCount} vote{voteCount > 1 ? 's' : ''} ({percentage}%)
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
                                  width: `${(voteCount / maxVotes) * 100}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                                  borderRadius: '15px',
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {stats.type === 'ranking' && (
                      <div>
                        {Object.keys(stats.rankingAverages).length > 0 ? (
                          <div>
                            {stats.options.map((option: string | Option, optIndex: number) => {
                              const opt = normalizeOption(option);
                              const rankingData = stats.rankingAverages[optIndex];
                              
                              if (!rankingData) return null;
                              
                              const avgPosition = rankingData.average;
                              const voteCount = rankingData.count;
                              
                              return (
                                <div key={optIndex} style={{
                                  marginBottom: '15px',
                                  padding: '15px',
                                  background: 'white',
                                  borderRadius: '10px',
                                  border: '1px solid #e0e0e0'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}>
                                    <span style={{ fontWeight: '600', fontSize: '16px' }}>
                                      {optIndex + 1}. {opt.text}
                                    </span>
                                    <span style={{ color: '#667eea', fontWeight: '600', fontSize: '16px' }}>
                                      Position moyenne: {(avgPosition + 1).toFixed(2)} ({voteCount} vote{voteCount > 1 ? 's' : ''})
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p style={{ color: '#999', fontStyle: 'italic' }}>Aucune réponse valide</p>
                        )}
                      </div>
                    )}

                    {stats.type === 'pairing' && (
                      <div>
                        {Object.keys(stats.coupleVotes).length > 0 ? (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                            gap: '15px'
                          }}>
                            {Object.entries(stats.coupleVotes)
                              .sort(([, a], [, b]) => (b as number) - (a as number))
                              .map(([coupleKey, voteCount]: [string, any]) => {
                                const [first, second] = coupleKey.split(',').map(i => parseInt(i));
                                const opt1 = normalizeOption(stats.options[first]);
                                const opt2 = normalizeOption(stats.options[second]);
                                
                                return (
                                  <div key={coupleKey} style={{
                                    padding: '15px',
                                    background: 'white',
                                    borderRadius: '10px',
                                    border: '1px solid #e0e0e0',
                                    textAlign: 'center'
                                  }}>
                                    <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '5px' }}>
                                      {opt1.text} ↔ {opt2.text}
                                    </div>
                                    <div style={{ color: '#667eea', fontWeight: '600', fontSize: '18px' }}>
                                      {voteCount} vote{voteCount > 1 ? 's' : ''}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <p style={{ color: '#999', fontStyle: 'italic' }}>Aucun couple formé</p>
                        )}
                      </div>
                    )}

                    {stats.type === 'categorization' && (() => {
                      const currentQuestion = questions[stats.questionIndex];
                      const categoryA = currentQuestion?.categoryA || 'Catégorie A';
                      const categoryB = currentQuestion?.categoryB || 'Catégorie B';
                      
                      return (
                        <div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '20px',
                            marginBottom: '20px'
                          }}>
                            <div style={{
                              padding: '15px',
                              background: '#e8f5e9',
                              borderRadius: '10px',
                              border: '2px solid #4caf50',
                              textAlign: 'center'
                            }}>
                              <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '10px' }}>
                                {categoryA}
                              </div>
                            </div>
                            <div style={{
                              padding: '15px',
                              background: '#fff3e0',
                              borderRadius: '10px',
                              border: '2px solid #ff9800',
                              textAlign: 'center'
                            }}>
                              <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '10px' }}>
                                {categoryB}
                              </div>
                            </div>
                          </div>
                          
                          {stats.options.map((option: string | Option, optIndex: number) => {
                            const opt = normalizeOption(option);
                            const categories = stats.personCategories?.[optIndex];
                            
                            if (!categories) return null;
                            
                            const categoryACount = categories.categoryA || 0;
                            const categoryBCount = categories.categoryB || 0;
                            const total = categoryACount + categoryBCount;
                            
                            return (
                              <div key={optIndex} style={{
                                marginBottom: '15px',
                                padding: '15px',
                                background: 'white',
                                borderRadius: '10px',
                                border: '1px solid #e0e0e0'
                              }}>
                                <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '10px' }}>
                                  {optIndex + 1}. {opt.text}
                                </div>
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr',
                                  gap: '15px'
                                }}>
                                  <div style={{
                                    padding: '10px',
                                    background: '#e8f5e9',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                  }}>
                                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4caf50' }}>
                                      {categoryACount}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                      {total > 0 ? Math.round((categoryACount / total) * 100) : 0}%
                                    </div>
                                  </div>
                                  <div style={{
                                    padding: '10px',
                                    background: '#fff3e0',
                                    borderRadius: '8px',
                                    textAlign: 'center'
                                  }}>
                                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff9800' }}>
                                      {categoryBCount}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                      {total > 0 ? Math.round((categoryBCount / total) * 100) : 0}%
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Styles pour l'impression */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
