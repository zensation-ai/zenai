/**
 * Learning Engine - Analysis & Metrics
 *
 * Feature extraction, bias detection, and quality metrics
 * for the learning engine.
 *
 * @module services/learning-engine/analysis
 */

import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import { parseJsonbWithDefault } from '../../types';

// ===========================================
// ENHANCED FEATURE EXTRACTION
// ===========================================

export interface ExtractedFeatures {
  linguistic: {
    avgSentenceLength: number;
    questionRatio: number;
    technicalTermDensity: number;
    emotionalIntensity: number;
  };
  semantic: {
    topEntities: string[];
    dominantTopics: string[];
    intentSignals: string[];
  };
  temporal: {
    timeReferences: string[];
    urgencyLevel: 'none' | 'low' | 'medium' | 'high';
    hasDeadline: boolean;
  };
  structural: {
    hasList: boolean;
    hasNumbers: boolean;
    hasCode: boolean;
    contentLength: 'short' | 'medium' | 'long';
  };
}

/**
 * Extract comprehensive features from text for better learning
 */
export function extractFeatures(text: string): ExtractedFeatures {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);

  // Linguistic features
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
  const questionCount = (text.match(/\?/g) || []).length;
  const questionRatio = sentences.length > 0 ? questionCount / sentences.length : 0;

  // Technical terms detection (expanded)
  const technicalTerms = text.match(/\b(API|SDK|UI|UX|SQL|HTTP|JSON|REST|GraphQL|Docker|Kubernetes|React|TypeScript|JavaScript|Python|Node|Git|AWS|Azure|GCP|CI|CD|DevOps|Microservice|Container|Database|Backend|Frontend|Framework|Library|Algorithm|Function|Variable|Class|Interface|Module|Package|Deploy|Build|Test|Debug|Refactor|Merge|Branch|Commit|Repository|Server|Client|Request|Response|Endpoint|Cache|Queue|Stream|Socket|Thread|Process|Memory|CPU|GPU|ML|AI|NLP|LLM|Embedding|Vector|Neural|Model|Training|Inference)\b/gi) || [];
  const technicalTermDensity = words.length > 0 ? technicalTerms.length / words.length : 0;

  // Emotional intensity detection
  const emotionalWords = text.match(/\b(super|toll|schlecht|furchtbar|großartig|schrecklich|fantastisch|katastrophal|unglaublich|awesome|terrible|amazing|horrible|exciting|frustrating|wonderful|awful|brilliant|disaster|incredible|dringend|sofort|wichtig|kritisch|urgent|critical|crucial|essential)\b/gi) || [];
  const emotionalIntensity = words.length > 0 ? emotionalWords.length / words.length : 0;

  // Semantic features - Entity extraction
  const entities: string[] = [];
  // Names (capitalized words not at sentence start)
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple name extraction, bounded input
  const namePattern = /(?<=[a-z][.?!]\s+|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const nameMatches = text.match(namePattern);
  if (nameMatches) {entities.push(...nameMatches.slice(0, 5));}

  // Dominant topics detection
  const topicIndicators: Record<string, string[]> = {
    'technology': ['software', 'app', 'code', 'system', 'tool', 'platform', 'digital', 'tech'],
    'business': ['kunde', 'customer', 'umsatz', 'revenue', 'projekt', 'project', 'meeting', 'strategie'],
    'personal': ['ich', 'mir', 'mein', 'family', 'health', 'hobby', 'privat', 'persönlich'],
    'learning': ['lernen', 'learn', 'study', 'kurs', 'course', 'understand', 'research', 'wissen'],
    'finance': ['geld', 'money', 'budget', 'kosten', 'cost', 'investition', 'investment', 'profit'],
    'communication': ['email', 'call', 'message', 'meeting', 'presentation', 'diskussion', 'feedback'],
  };

  const dominantTopics: string[] = [];
  const textLower = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(topicIndicators)) {
    const matchCount = keywords.filter(kw => textLower.includes(kw)).length;
    if (matchCount >= 2) {dominantTopics.push(topic);}
  }

  // Intent signals detection
  const intentSignals: string[] = [];
  if (/\b(muss|müssen|sollte|should|must|need to|have to)\b/i.test(text)) {intentSignals.push('obligation');}
  if (/\b(will|wollen|möchte|want|would like|plan to)\b/i.test(text)) {intentSignals.push('intention');}
  if (/\b(frage|warum|wie|was|why|how|what|when)\b/i.test(text) || text.includes('?')) {intentSignals.push('inquiry');}
  if (/\b(idee|vorschlag|könnten|idea|suggest|propose|maybe)\b/i.test(text)) {intentSignals.push('suggestion');}
  if (/\b(problem|fehler|bug|issue|error|broken)\b/i.test(text)) {intentSignals.push('problem-report');}

  // Temporal features
  const timeReferences: string[] = [];
  const timePatterns = [
    /\b(heute|today)\b/gi,
    /\b(morgen|tomorrow)\b/gi,
    /\b(diese woche|this week)\b/gi,
    /\b(nächste woche|next week)\b/gi,
    /\b(bis|until|by)\s+\d{1,2}[./]\d{1,2}/gi,
    /\b(in \d+ (tagen|wochen|monaten)|in \d+ (days|weeks|months))\b/gi,
  ];
  for (const pattern of timePatterns) {
    const matches = text.match(pattern);
    if (matches) {timeReferences.push(...matches);}
  }

  // Urgency level
  let urgencyLevel: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (/\b(heute|sofort|asap|dringend|urgent|immediately|kritisch|critical)\b/i.test(text)) {
    urgencyLevel = 'high';
  } else if (/\b(bald|soon|zeitnah|diese woche|this week)\b/i.test(text)) {
    urgencyLevel = 'medium';
  } else if (/\b(später|eventually|irgendwann|sometime)\b/i.test(text)) {
    urgencyLevel = 'low';
  }

  const hasDeadline = /\b(bis|deadline|until|by)\s+(\d{1,2}[./]\d{1,2}|\d{4}|montag|dienstag|mittwoch|donnerstag|freitag|monday|tuesday|wednesday|thursday|friday)/i.test(text);

  // Structural features
  const hasList = /^[\s]*[-*•]\s|^\s*\d+[.)]/m.test(text);
  const hasNumbers = /\d+/.test(text);
  const hasCode = /```|`[^`]+`|function\s*\(|const\s+\w+|let\s+\w+|var\s+\w+|=>|import\s+\{/.test(text);

  let contentLength: 'short' | 'medium' | 'long' = 'short';
  if (words.length > 100) {contentLength = 'long';}
  else if (words.length > 30) {contentLength = 'medium';}

  return {
    linguistic: {
      avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      questionRatio: Math.round(questionRatio * 100) / 100,
      technicalTermDensity: Math.round(technicalTermDensity * 1000) / 1000,
      emotionalIntensity: Math.round(emotionalIntensity * 1000) / 1000,
    },
    semantic: {
      topEntities: entities.slice(0, 5),
      dominantTopics,
      intentSignals,
    },
    temporal: {
      timeReferences: timeReferences.slice(0, 5),
      urgencyLevel,
      hasDeadline,
    },
    structural: {
      hasList,
      hasNumbers,
      hasCode,
      contentLength,
    },
  };
}

// ===========================================
// BIAS DETECTION & CORRECTION
// ===========================================

export interface BiasReport {
  detected: boolean;
  biasType: string | null;
  severity: 'none' | 'low' | 'medium' | 'high';
  details: string;
  recommendation: string;
}

/**
 * Detect potential biases in learning data
 */
export async function detectLearningBias(
  _userId: string = 'default'
): Promise<BiasReport> {
  const client = await pool.connect();

  try {
    // Get category distribution
    const categoryResult = await client.query(
      `SELECT category, COUNT(*) as count
       FROM ideas
       WHERE is_archived = false
       GROUP BY category`
    );

    // Get type distribution
    const typeResult = await client.query(
      `SELECT type, COUNT(*) as count
       FROM ideas
       WHERE is_archived = false
       GROUP BY type`
    );

    // Get priority distribution
    const priorityResult = await client.query(
      `SELECT priority, COUNT(*) as count
       FROM ideas
       WHERE is_archived = false
       GROUP BY priority`
    );

    const categories = categoryResult.rows;
    const types = typeResult.rows;
    const priorities = priorityResult.rows;

    // Calculate concentration metrics
    const totalIdeas = categories.reduce((sum, c) => sum + parseInt(c.count, 10), 0);
    if (totalIdeas < 10) {
      return {
        detected: false,
        biasType: null,
        severity: 'none',
        details: 'Nicht genügend Daten für Bias-Analyse',
        recommendation: 'Sammle mehr Ideen für eine aussagekräftige Analyse.',
      };
    }

    // Check for category dominance bias
    const categoryMax = Math.max(...categories.map(c => parseInt(c.count, 10)));
    const categoryDominance = categoryMax / totalIdeas;

    // Check for type dominance bias
    const typeMax = Math.max(...types.map(t => parseInt(t.count, 10)));
    const typeDominance = types.length > 0 ? typeMax / totalIdeas : 0;

    // Check for priority skew bias
    const priorityCounts = priorities.reduce((acc, p) => {
      acc[p.priority] = parseInt(p.count, 10);
      return acc;
    }, {} as Record<string, number>);
    const highPriorityRatio = (priorityCounts['high'] || 0) / totalIdeas;
    const lowPriorityRatio = (priorityCounts['low'] || 0) / totalIdeas;

    // Determine bias type and severity
    let biasType: string | null = null;
    let severity: 'none' | 'low' | 'medium' | 'high' = 'none';
    let details = '';
    let recommendation = '';

    if (categoryDominance > 0.8) {
      const dominantCategory = categories.find(c => parseInt(c.count, 10) === categoryMax)?.category;
      biasType = 'category-dominance';
      severity = categoryDominance > 0.9 ? 'high' : 'medium';
      details = `${Math.round(categoryDominance * 100)}% der Ideen sind in Kategorie "${dominantCategory}"`;
      recommendation = 'Versuche, Ideen aus verschiedenen Lebensbereichen zu erfassen. Das System lernt möglicherweise, alles in diese Kategorie einzuordnen.';
    } else if (typeDominance > 0.7) {
      const dominantType = types.find(t => parseInt(t.count, 10) === typeMax)?.type;
      biasType = 'type-dominance';
      severity = typeDominance > 0.85 ? 'high' : 'medium';
      details = `${Math.round(typeDominance * 100)}% der Ideen sind vom Typ "${dominantType}"`;
      recommendation = 'Verschiedene Arten von Gedanken (Ideen, Aufgaben, Fragen, Erkenntnisse) helfen dem System, besser zu differenzieren.';
    } else if (highPriorityRatio > 0.6) {
      biasType = 'priority-inflation';
      severity = highPriorityRatio > 0.75 ? 'high' : 'medium';
      details = `${Math.round(highPriorityRatio * 100)}% der Ideen haben hohe Priorität`;
      recommendation = 'Wenn alles hohe Priorität hat, verliert die Priorisierung ihren Wert. Überprüfe, ob wirklich alles dringend ist.';
    } else if (lowPriorityRatio > 0.7) {
      biasType = 'priority-deflation';
      severity = 'low';
      details = `${Math.round(lowPriorityRatio * 100)}% der Ideen haben niedrige Priorität`;
      recommendation = 'Viele niedrig priorisierte Ideen sind normal, aber stelle sicher, dass wichtige Dinge nicht untergehen.';
    } else if (categories.length < 3 && totalIdeas > 20) {
      biasType = 'limited-diversity';
      severity = 'low';
      details = `Nur ${categories.length} Kategorien bei ${totalIdeas} Ideen`;
      recommendation = 'Mehr Vielfalt in den Kategorien würde das Lernen verbessern.';
    }

    // Check for time-based bias (recency)
    const recentResult = await client.query(
      `SELECT COUNT(*) as recent_count
       FROM ideas
       WHERE is_archived = false
         AND created_at > NOW() - INTERVAL '7 days'`
    );
    const recentCount = parseInt(recentResult.rows[0].recent_count, 10);
    const recentRatio = recentCount / totalIdeas;

    if (recentRatio > 0.7 && !biasType) {
      biasType = 'recency-bias';
      severity = 'low';
      details = `${Math.round(recentRatio * 100)}% der Ideen sind aus den letzten 7 Tagen`;
      recommendation = 'Das System könnte aktuelle Muster übergewichten. Ältere Muster werden möglicherweise unterrepräsentiert.';
    }

    return {
      detected: biasType !== null,
      biasType,
      severity,
      details: details || 'Keine signifikanten Verzerrungen erkannt',
      recommendation: recommendation || 'Die Lernverteilung sieht ausgewogen aus.',
    };

  } catch (error) {
    logger.error('Error detecting learning bias', error instanceof Error ? error : undefined);
    return {
      detected: false,
      biasType: null,
      severity: 'none',
      details: 'Fehler bei der Bias-Analyse',
      recommendation: 'Bitte später erneut versuchen.',
    };
  } finally {
    client.release();
  }
}

/**
 * Get learning quality metrics
 */
export async function getLearningQualityMetrics(
  userId: string = 'default'
): Promise<{
  dataQuality: number;
  diversityScore: number;
  learningProgress: number;
  correctionRate: number;
  biasReport: BiasReport;
}> {
  const client = await pool.connect();

  try {
    // Get total ideas
    const totalResult = await client.query(
      `SELECT COUNT(*) as count FROM ideas WHERE is_archived = false`
    );
    const totalIdeas = parseInt(totalResult.rows[0].count, 10);

    // Get ideas with embeddings (data quality indicator)
    const embeddingResult = await client.query(
      `SELECT COUNT(*) as count FROM ideas WHERE is_archived = false AND embedding IS NOT NULL`
    );
    const withEmbeddings = parseInt(embeddingResult.rows[0].count, 10);
    const dataQuality = totalIdeas > 0 ? withEmbeddings / totalIdeas : 0;

    // Get category diversity (using Gini coefficient approximation)
    const categoryResult = await client.query(
      `SELECT category, COUNT(*) as count FROM ideas WHERE is_archived = false GROUP BY category`
    );
    const categoryDistribution = categoryResult.rows.map(r => parseInt(r.count, 10));
    const diversityScore = calculateDiversityScore(categoryDistribution);

    // Get user profile for learning progress
    const profileResult = await client.query(
      `SELECT productivity_patterns FROM user_profile WHERE id = $1`,
      [userId]
    );
    const patterns = parseJsonbWithDefault<{ learning_confidence?: number }>(profileResult.rows[0]?.productivity_patterns, {});
    const learningProgress = patterns.learning_confidence || 0;

    // Estimate correction rate (how often user corrects AI suggestions)
    // This would need actual tracking, so we estimate based on profile age
    const correctionRate = 0; // Placeholder - would need tracking implementation

    // Get bias report
    const biasReport = await detectLearningBias(userId);

    return {
      dataQuality: Math.round(dataQuality * 100) / 100,
      diversityScore: Math.round(diversityScore * 100) / 100,
      learningProgress: Math.round(learningProgress * 100) / 100,
      correctionRate,
      biasReport,
    };

  } catch (error) {
    logger.error('Error getting learning quality metrics', error instanceof Error ? error : undefined);
    return {
      dataQuality: 0,
      diversityScore: 0,
      learningProgress: 0,
      correctionRate: 0,
      biasReport: {
        detected: false,
        biasType: null,
        severity: 'none',
        details: 'Fehler bei der Metrik-Berechnung',
        recommendation: '',
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Calculate diversity score using normalized entropy
 */
function calculateDiversityScore(distribution: number[]): number {
  if (distribution.length === 0) {return 0;}
  if (distribution.length === 1) {return 0;} // Only one category = no diversity

  const total = distribution.reduce((a, b) => a + b, 0);
  if (total === 0) {return 0;}

  // Calculate Shannon entropy
  let entropy = 0;
  for (const count of distribution) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }

  // Normalize by maximum possible entropy (uniform distribution)
  const maxEntropy = Math.log2(distribution.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}
