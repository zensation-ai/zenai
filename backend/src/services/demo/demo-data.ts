/**
 * Demo Data Definitions
 *
 * Realistic German-language demo data for the "Startup-Gründer Alexander" persona.
 * Used by the interactive demo mode to populate the demo schema.
 *
 * All IDs are stable UUIDs so seed is idempotent.
 */

export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000002';

// ─── Ideas ────────────────────────────────────────────────────────────────────

export interface DemoIdea {
  id: string;
  title: string;
  summary: string;
  type: string;
  category: string;
  priority: string;
  is_archived: boolean;
  context: string;
  user_id: string;
}

export const DEMO_IDEAS: DemoIdea[] = [
  // AI/ML – active
  {
    id: 'a1b2c3d4-0001-0000-0000-000000000001',
    title: 'KI-gestützter Onboarding-Assistent',
    summary:
      'Neuen Mitarbeitern fehlt oft der Kontext, der für schnelles Einarbeiten nötig ist. Ein KI-Assistent könnte Fragen beantworten und relevante Dokumente automatisch vorschlagen. Damit könnten wir die Einarbeitungszeit um 30 % reduzieren.',
    type: 'idea',
    category: 'technical',
    priority: 'high',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0002-0000-0000-000000000002',
    title: 'Automatische Meeting-Protokollierung via Whisper',
    summary:
      'Meetings werden selten vollständig protokolliert, wichtige Entscheidungen gehen verloren. Mit Whisper-Transkription und anschließender KI-Zusammenfassung könnten Protokolle in Echtzeit erstellt werden. Die Action Items würden direkt als Tasks angelegt.',
    type: 'idea',
    category: 'technical',
    priority: 'high',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0003-0000-0000-000000000003',
    title: 'Sentiment-Analyse für Kundenfeedback',
    summary:
      'Wir erhalten täglich dutzende Kundenmails, die manuell ausgewertet werden. Eine Sentiment-Analyse würde kritische Feedbacks priorisieren und Trends sichtbar machen. Das spart dem Support-Team täglich ca. zwei Stunden.',
    type: 'insight',
    category: 'business',
    priority: 'medium',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0004-0000-0000-000000000004',
    title: 'Personalisierte Lernpfade für Enterprise-Kunden',
    summary:
      'Enterprise-Kunden nutzen nur 20 % der Plattform-Features. Mit personalisierten Lernpfaden, die auf der Nutzungshistorie basieren, könnten wir Adoption und Kundenbindung steigern. Pilotprojekt mit drei Bestandskunden geplant.',
    type: 'idea',
    category: 'business',
    priority: 'medium',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0005-0000-0000-000000000005',
    title: 'Embedding-basiertes Duplikat-Erkennung',
    summary:
      'Im Ideenpool gibt es viele ähnliche Ideen, die doppelt bearbeitet werden. Durch Cosine-Similarity auf Embeddings können Duplikate beim Erstellen erkannt und zusammengeführt werden. Der Schwellenwert von 0,92 hat sich in Tests bewährt.',
    type: 'idea',
    category: 'technical',
    priority: 'low',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // Startup Operations – active
  {
    id: 'a1b2c3d4-0006-0000-0000-000000000006',
    title: 'Series-A Pitch-Deck überarbeiten',
    summary:
      'Das aktuelle Deck stammt aus dem Vorgespräch mit Investors im Januar. Für die finale Präsentation müssen Traktion-Metriken, neue Case Studies und ein überarbeitetes Unit-Economics-Slide ergänzt werden. Deadline ist der 15. April.',
    type: 'task',
    category: 'business',
    priority: 'high',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0007-0000-0000-000000000007',
    title: 'OKR-Framework für Q2 definieren',
    summary:
      'Das Team wächst auf 12 Personen und braucht ein gemeinsames Zielsystem. OKRs sind für unser Stadium die beste Methode, da sie Fokus schaffen ohne zu viel Prozess. Workshop mit allen Teamleads für Ende März geplant.',
    type: 'task',
    category: 'business',
    priority: 'high',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0008-0000-0000-000000000008',
    title: 'Remote-Work-Policy festlegen',
    summary:
      'Die Hälfte des Teams arbeitet remote, es gibt aber keine klare Policy zu Kernarbeitszeiten und Kommunikationsregeln. Das führt zu Missverständnissen und unterschiedlichen Erwartungen. Eine Seite mit klaren Grundregeln würde helfen.',
    type: 'problem',
    category: 'personal',
    priority: 'medium',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0009-0000-0000-000000000009',
    title: 'Automatisierte Buchhaltung via DATEV-API',
    summary:
      'Monatsabschlüsse dauern aktuell drei Tage, weil Belege manuell eingegeben werden. Eine DATEV-API-Integration würde Belege automatisch kategorisieren und den Steuerberater entlasten. ROI ist nach spätestens sechs Monaten erreicht.',
    type: 'idea',
    category: 'business',
    priority: 'medium',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0010-0000-0000-000000000010',
    title: 'ESOP für erste Mitarbeiter strukturieren',
    summary:
      'Drei Schlüsselmitarbeiter haben nach Vesting-Cliff angefragt. Ein fairer ESOP-Pool von 10 % wäre marktüblich und würde die Bindung sichern. Anwaltliche Prüfung des Vesting-Schemas ist diese Woche geplant.',
    type: 'task',
    category: 'business',
    priority: 'high',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // Product Development – active
  {
    id: 'a1b2c3d4-0011-0000-0000-000000000011',
    title: 'Dark Mode für Mobile App',
    summary:
      'Nutzer haben Dark Mode mehrfach angefragt, besonders für die Abendnutzung. Die Umsetzung wäre über CSS-Custom-Properties in zwei Wochen realisierbar. App-Store-Bewertungen zeigen, dass Dark Mode ein häufiges Ablehnungsargument ist.',
    type: 'idea',
    category: 'technical',
    priority: 'medium',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0012-0000-0000-000000000012',
    title: 'Offline-Modus für kritische Features',
    summary:
      'Bei schlechter Verbindung (Bahn, Flugzeug) bricht die App komplett ab. IndexedDB-Caching für Lesen und eine Sync-Queue für Schreiben würden Resilienz schaffen. React Query offline-first Mode wäre ein guter Startpunkt.',
    type: 'idea',
    category: 'technical',
    priority: 'medium',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0013-0000-0000-000000000013',
    title: 'API-Versionierung einführen',
    summary:
      'Wir haben drei Enterprise-Kunden, die eigene Integrationen gebaut haben. Breaking Changes ohne Versionierung würden diese Integrationen zerstören. Eine /v1/ URL-Prefix-Strategie mit einem 6-Monate-Deprecation-Zyklus wäre sinnvoll.',
    type: 'problem',
    category: 'technical',
    priority: 'high',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // Marketing – active
  {
    id: 'a1b2c3d4-0014-0000-0000-000000000014',
    title: 'Thought-Leadership-Blog auf LinkedIn',
    summary:
      'Konkurrenten bauen starke Personal Brands auf und gewinnen damit Inbound-Leads. Wöchentliche Artikel zu KI im Unternehmenskontext würden Glaubwürdigkeit und Sichtbarkeit aufbauen. Erste drei Themen sind bereits geskizziert.',
    type: 'idea',
    category: 'business',
    priority: 'medium',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0015-0000-0000-000000000015',
    title: 'Product Hunt Launch vorbereiten',
    summary:
      'Der MVP ist stabil genug für einen öffentlichen Launch. Product Hunt bietet kostenlose Sichtbarkeit bei Tech-Early-Adopters, die genau unsere Zielgruppe sind. Hunter aussuchen und Assets vorbereiten sind die nächsten Schritte.',
    type: 'task',
    category: 'business',
    priority: 'high',
    is_archived: false,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // Archived
  {
    id: 'a1b2c3d4-0016-0000-0000-000000000016',
    title: 'Eigene LLM-Infrastruktur betreiben',
    summary:
      'Ursprüngliche Idee war, eigene GPU-Server für LLM-Inferenz zu betreiben. Nach Kostenanalyse ist API-basierter Ansatz bei unserem Volumen 5x günstiger. Archiviert zugunsten Claude + Ollama-Fallback-Architektur.',
    type: 'idea',
    category: 'technical',
    priority: 'low',
    is_archived: true,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0017-0000-0000-000000000017',
    title: 'B2C-Pivot als Alternative evaluieren',
    summary:
      'Im Q3 letzten Jahres wurde ein B2C-Modell als Alternative zum Enterprise-Fokus evaluiert. CAC wäre im B2C-Segment sechsmal höher bei gleichem LTV. Entscheidung: klarer Enterprise-Fokus bleibt.',
    type: 'insight',
    category: 'business',
    priority: 'low',
    is_archived: true,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0018-0000-0000-000000000018',
    title: 'Blockchain-basiertes Berechtigungssystem',
    summary:
      'Idee war, Zugriffsrechte auf Basis von NFTs zu verwalten. Technisch interessant, aber für unsere Zielgruppe kein Mehrwert. Archiviert – klassisches RBAC ist ausreichend und besser wartbar.',
    type: 'idea',
    category: 'technical',
    priority: 'low',
    is_archived: true,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0019-0000-0000-000000000019',
    title: 'Native iOS/Android-App entwickeln',
    summary:
      'Wurde im Rahmen des Mobile-Strategie-Reviews diskutiert. PWA deckt 95 % der Mobile-Use-Cases ab und ist wartungsärmer. Archiviert – native App erst relevant ab 50.000 MAU.',
    type: 'idea',
    category: 'technical',
    priority: 'low',
    is_archived: true,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'a1b2c3d4-0020-0000-0000-000000000020',
    title: 'Hardware-Produkt als Erweiterung',
    summary:
      'Smart-Display für den Schreibtisch, das KI-Zusammenfassungen zeigt. Prototyp wurde skizziert, aber Hardwareentwicklung außerhalb unserer Kernkompetenz. Archiviert – Fokus auf Software-First-Strategie.',
    type: 'idea',
    category: 'business',
    priority: 'low',
    is_archived: true,
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
];

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface DemoProject {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: string;
  context: string;
  user_id: string;
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: 'b2c3d4e5-0001-0000-0000-000000000001',
    name: 'MVP Launch Q2',
    description:
      'Alles, was für den öffentlichen Launch des MVP im Q2 notwendig ist: Feature-Freeze, QA, Marketing-Assets und Product-Hunt-Vorbereitung.',
    color: '#4A90D9',
    icon: '🚀',
    status: 'active',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'b2c3d4e5-0002-0000-0000-000000000002',
    name: 'Marketing Kampagne',
    description:
      'Go-to-Market-Strategie für Q2: LinkedIn-Content, Product Hunt Launch, erste bezahlte Kanäle und PR-Outreach.',
    color: '#E84393',
    icon: '📣',
    status: 'active',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'b2c3d4e5-0003-0000-0000-000000000003',
    name: 'KI-Modell Training',
    description:
      'Feinabstimmung der internen KI-Modelle auf Kundendaten: Datenpipeline, Labeling, Training-Runs und Evaluierung.',
    color: '#8B5CF6',
    icon: '🧠',
    status: 'active',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'b2c3d4e5-0004-0000-0000-000000000004',
    name: 'Team Building',
    description:
      'Aufbau des Engineering- und Sales-Teams für Skalierung: Hiring, Onboarding, Kultur und ESOP-Strukturierung.',
    color: '#10B981',
    icon: '👥',
    status: 'active',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'b2c3d4e5-0005-0000-0000-000000000005',
    name: 'Finanzplanung',
    description:
      'Series-A-Vorbereitung, 18-Monats-Runway-Planung, DATEV-Integration und monatliches Financial Reporting.',
    color: '#F59E0B',
    icon: '💰',
    status: 'active',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
];

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface DemoTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  project_id: string;
  context: string;
  user_id: string;
}

export const DEMO_TASKS: DemoTask[] = [
  // MVP Launch Q2
  {
    id: 'c3d4e5f6-0001-0000-0000-000000000001',
    title: 'Feature-Freeze definieren',
    description:
      'Liste aller Features, die für den Launch enthalten sein müssen, vs. Post-Launch-Backlog. Mit dem Tech Lead und PM abstimmen.',
    status: 'done',
    priority: 'high',
    project_id: 'b2c3d4e5-0001-0000-0000-000000000001',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0002-0000-0000-000000000002',
    title: 'QA-Testplan erstellen',
    description:
      'Umfassenden Testplan für alle kritischen User Journeys erstellen. Fokus auf Onboarding, Core Features und Zahlungsabwicklung.',
    status: 'in_progress',
    priority: 'high',
    project_id: 'b2c3d4e5-0001-0000-0000-000000000001',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0003-0000-0000-000000000003',
    title: 'Launch-Checklist abarbeiten',
    description:
      'SSL, DSGVO-konformes Cookie-Banner, Impressum, AGB, Datenschutzerklärung, Monitoring-Alerts, Backup-Strategie.',
    status: 'todo',
    priority: 'high',
    project_id: 'b2c3d4e5-0001-0000-0000-000000000001',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // Marketing Kampagne
  {
    id: 'c3d4e5f6-0004-0000-0000-000000000004',
    title: 'Product Hunt Hunter suchen',
    description:
      'Hunter mit hoher Followerzahl und Erfahrung im SaaS-Bereich identifizieren und kontaktieren. Timing: 4 Wochen vor Launch.',
    status: 'in_progress',
    priority: 'high',
    project_id: 'b2c3d4e5-0002-0000-0000-000000000002',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0005-0000-0000-000000000005',
    title: 'LinkedIn-Artikel-Kalender erstellen',
    description:
      'Redaktionsplan für 12 Wochen mit Themen, Zielgruppen und Posting-Zeiten. Erste drei Artikel bereits vorschreiben.',
    status: 'todo',
    priority: 'medium',
    project_id: 'b2c3d4e5-0002-0000-0000-000000000002',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0006-0000-0000-000000000006',
    title: 'Pressemitteilung für Launch verfassen',
    description:
      'Pressemitteilung für Tech-Medien (t3n, Gründerszene) und KI-spezifische Medien. Mit Kernbotschaft, Gründer-Zitat und Use Case.',
    status: 'backlog',
    priority: 'medium',
    project_id: 'b2c3d4e5-0002-0000-0000-000000000002',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // KI-Modell Training
  {
    id: 'c3d4e5f6-0007-0000-0000-000000000007',
    title: 'Trainingsdaten-Pipeline aufbauen',
    description:
      'ETL-Pipeline für Kundendaten: Anonymisierung, Formatierung, Qualitätsprüfung, Speicherung in Object Storage.',
    status: 'in_progress',
    priority: 'high',
    project_id: 'b2c3d4e5-0003-0000-0000-000000000003',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0008-0000-0000-000000000008',
    title: 'Evaluierungs-Benchmark definieren',
    description:
      'Metriken und Testdatensatz für Modell-Evaluierung festlegen. RAGAS für RAG-Qualität, BLEU für Generierung.',
    status: 'todo',
    priority: 'medium',
    project_id: 'b2c3d4e5-0003-0000-0000-000000000003',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0009-0000-0000-000000000009',
    title: 'Erstes Fine-Tuning-Experiment durchführen',
    description:
      'Fine-Tuning auf Claude Haiku mit 500 Beispielen aus dem Kundensupport. Ziel: 20 % bessere Antwortqualität bei Support-Anfragen.',
    status: 'backlog',
    priority: 'medium',
    project_id: 'b2c3d4e5-0003-0000-0000-000000000003',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // Team Building
  {
    id: 'c3d4e5f6-0010-0000-0000-000000000010',
    title: 'Senior Backend Engineer einstellen',
    description:
      'Anforderungsprofil: 5+ Jahre, TypeScript/Node.js, PostgreSQL, Erfahrung in SaaS-Startups. Zielgehalt: 90–110k.',
    status: 'in_progress',
    priority: 'high',
    project_id: 'b2c3d4e5-0004-0000-0000-000000000004',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0011-0000-0000-000000000011',
    title: 'Onboarding-Dokumentation aktualisieren',
    description:
      'Tech-Setup-Guide, Toolstack, Deploymentprozess und erste 30 Tage als neues Teammitglied dokumentieren.',
    status: 'todo',
    priority: 'medium',
    project_id: 'b2c3d4e5-0004-0000-0000-000000000004',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0012-0000-0000-000000000012',
    title: 'ESOP-Vertrag mit Anwalt finalisieren',
    description:
      'Vesting-Schema (4 Jahre, 1 Jahr Cliff), Pool-Größe (10 %), Bewertungsgrundlage und Steueroptimierung klären.',
    status: 'done',
    priority: 'high',
    project_id: 'b2c3d4e5-0004-0000-0000-000000000004',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },

  // Finanzplanung
  {
    id: 'c3d4e5f6-0013-0000-0000-000000000013',
    title: 'Series-A Pitch Deck finalisieren',
    description:
      'Traktion-Slides mit aktuellen MRR/ARR-Zahlen, NPS-Score und Net-Revenue-Retention aktualisieren. Design Review mit Pitch-Coach.',
    status: 'in_progress',
    priority: 'high',
    project_id: 'b2c3d4e5-0005-0000-0000-000000000005',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0014-0000-0000-000000000014',
    title: '18-Monats-Finanzmodell bauen',
    description:
      'Bottom-up-Modell mit Wachstumsannahmen, Hiring-Plan, CAC/LTV-Projektion und Break-Even-Analyse. In Excel + Google Sheets.',
    status: 'todo',
    priority: 'high',
    project_id: 'b2c3d4e5-0005-0000-0000-000000000005',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'c3d4e5f6-0015-0000-0000-000000000015',
    title: 'Monatliches Financial Reporting einrichten',
    description:
      'Dashboard mit MRR, ARR, Churn, CAC, LTV, Burn Rate und Runway. Automatisierter Export für Board-Meeting.',
    status: 'backlog',
    priority: 'medium',
    project_id: 'b2c3d4e5-0005-0000-0000-000000000005',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
];

// ─── Contacts ─────────────────────────────────────────────────────────────────

export interface DemoContact {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string[];
  role: string;
  relationship_type: string;
  notes: string;
  tags: string[];
  user_id: string;
}

export const DEMO_CONTACTS: DemoContact[] = [
  {
    id: 'd4e5f6a7-0001-0000-0000-000000000001',
    display_name: 'Dr. Katja Richter',
    first_name: 'Katja',
    last_name: 'Richter',
    email: ['k.richter@hv-capital.de'],
    role: 'Partner',
    relationship_type: 'investor',
    notes:
      'Lead-Investorin für Seed-Runde. Fokus auf B2B-SaaS und KI. Sehr netzwerkorientiert, hilft bei Enterprise-Intros. Nächstes Meeting: Board Call am 10. April.',
    tags: ['investor', 'board', 'ki-fokus'],
    user_id: DEMO_USER_ID,
  },
  {
    id: 'd4e5f6a7-0002-0000-0000-000000000002',
    display_name: 'Markus Engel',
    first_name: 'Markus',
    last_name: 'Engel',
    email: ['m.engel@engelventures.com'],
    role: 'Managing Director',
    relationship_type: 'investor',
    notes:
      'Angel-Investor, ehemaliger CTO bei Zalando. Technischer Sparringspartner für Architekturentscheidungen. Hat bereits zweimal Brückenfinanzierung bereitgestellt.',
    tags: ['investor', 'angel', 'tech-advisor'],
    user_id: DEMO_USER_ID,
  },
  {
    id: 'd4e5f6a7-0003-0000-0000-000000000003',
    display_name: 'Sarah Müller',
    first_name: 'Sarah',
    last_name: 'Müller',
    email: ['sarah@example.com'],
    role: 'Co-Founderin & CPO',
    relationship_type: 'colleague',
    notes:
      'Co-Founderin und Head of Product. Verantwortlich für Roadmap, Design und Customer Success. Tägliches Standup um 9:30 Uhr.',
    tags: ['co-founder', 'product', 'intern'],
    user_id: DEMO_USER_ID,
  },
  {
    id: 'd4e5f6a7-0004-0000-0000-000000000004',
    display_name: 'Jonas Weber',
    first_name: 'Jonas',
    last_name: 'Weber',
    email: ['jonas@example.com'],
    role: 'Lead Engineer',
    relationship_type: 'colleague',
    notes:
      'Erster Mitarbeiter, baut das gesamte Backend-System. Experte für PostgreSQL und Distributed Systems. Wichtig: montags kein Meeting vor 10 Uhr.',
    tags: ['team', 'engineering', 'backend'],
    user_id: DEMO_USER_ID,
  },
  {
    id: 'd4e5f6a7-0005-0000-0000-000000000005',
    display_name: 'Prof. Dr. Thomas Keller',
    first_name: 'Thomas',
    last_name: 'Keller',
    email: ['t.keller@tum.de'],
    role: 'KI-Berater & Scientific Advisor',
    relationship_type: 'partner',
    notes:
      'Lehrstuhlinhaber für Machine Learning an der TU München. Berät uns bei Modell-Architektur und Datenstrategie. Gibt außerdem Zugang zu Studierenden für Praktika.',
    tags: ['advisor', 'wissenschaft', 'ki'],
    user_id: DEMO_USER_ID,
  },
  {
    id: 'd4e5f6a7-0006-0000-0000-000000000006',
    display_name: 'Lisa Braun',
    first_name: 'Lisa',
    last_name: 'Braun',
    email: ['l.braun@allianz.de'],
    role: 'Head of Digital Innovation',
    relationship_type: 'client',
    notes:
      'Hauptansprechpartnerin bei Allianz (Pilot-Kunde). Hat intern 50 Lizenzen genehmigt und ist zufrieden mit dem Onboarding. Potenzial für Enterprise-Deal über 200 Lizenzen.',
    tags: ['enterprise-kunde', 'pilot', 'versicherung'],
    user_id: DEMO_USER_ID,
  },
  {
    id: 'd4e5f6a7-0007-0000-0000-000000000007',
    display_name: 'Felix Hoffmann',
    first_name: 'Felix',
    last_name: 'Hoffmann',
    email: ['felix@hoffmannpr.de'],
    role: 'PR-Berater',
    relationship_type: 'partner',
    notes:
      'Freier PR-Berater für Tech-Startups. Hat Minga und Personio beim Launch begleitet. Werden ihn für Product-Hunt-Launch und Pressemitteilungen engagieren.',
    tags: ['pr', 'marketing', 'launch'],
    user_id: DEMO_USER_ID,
  },
  {
    id: 'd4e5f6a7-0008-0000-0000-000000000008',
    display_name: 'Anja Schneider',
    first_name: 'Anja',
    last_name: 'Schneider',
    email: ['a.schneider@nextlaw.de'],
    role: 'Rechtsanwältin – Gesellschaftsrecht',
    relationship_type: 'partner',
    notes:
      'Anwältin für Gesellschafts- und Arbeitsrecht. Hat unsere GmbH-Gründung begleitet und arbeitet gerade an den ESOP-Verträgen. Sehr kompetent im Startup-Kontext.',
    tags: ['legal', 'esop', 'gesellschaftsrecht'],
    user_id: DEMO_USER_ID,
  },
];

// ─── Memory Facts ──────────────────────────────────────────────────────────────

export interface DemoMemoryFact {
  id: string;
  fact_type: string;
  content: string;
  confidence: number;
  source: string;
  context: string;
  user_id: string;
}

export const DEMO_MEMORY_FACTS: DemoMemoryFact[] = [
  {
    id: 'e5f6a7b8-0001-0000-0000-000000000001',
    fact_type: 'preference',
    content:
      'Alexander bevorzugt morgens Deep Work (Coding, Strategiearbeit) und legt Meetings auf den Nachmittag. Er ist am produktivsten zwischen 8 und 12 Uhr.',
    confidence: 0.95,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0002-0000-0000-000000000002',
    fact_type: 'expertise',
    content:
      'Alexander hat tiefes technisches Wissen in TypeScript, Node.js und PostgreSQL. Er kann Architekturentscheidungen selbst treffen und braucht bei technischen Fragen keine Grundlagenerklärungen.',
    confidence: 0.9,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0003-0000-0000-000000000003',
    fact_type: 'preference',
    content:
      'Er schreibt Antworten und Dokumente lieber auf Deutsch, auch wenn die technische Diskussion auf Englisch stattfindet. Ausnahme: internationale Investoren-Kommunikation.',
    confidence: 0.92,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0004-0000-0000-000000000004',
    fact_type: 'decision',
    content:
      'Im Februar 2026 hat Alexander entschieden, nicht auf eigene LLM-Infrastruktur umzustellen. Der API-Ansatz (Claude primär, Ollama als Fallback) ist bei aktuellem Volumen fünfmal günstiger.',
    confidence: 0.98,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0005-0000-0000-000000000005',
    fact_type: 'goal',
    content:
      'Das wichtigste Ziel für Q2 2026 ist der erfolgreiche MVP-Launch inklusive Product Hunt. Sekundärziel: Series-A-Term-Sheet bis Ende Q2.',
    confidence: 0.95,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0006-0000-0000-000000000006',
    fact_type: 'working_style',
    content:
      'Alexander arbeitet am liebsten in 90-Minuten-Blöcken mit 20 Minuten Pause. Er nutzt Pomodoro-Technik für administrative Aufgaben, aber nicht für kreative oder strategische Arbeit.',
    confidence: 0.85,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0007-0000-0000-000000000007',
    fact_type: 'expertise',
    content:
      'Tiefes Wissen in Enterprise-Sales und B2B-SaaS-Metriken (MRR, ARR, NRR, CAC, LTV). Hat zuvor zwei Jahre als Produktmanager bei einem SaaS-Unternehmen gearbeitet.',
    confidence: 0.88,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0008-0000-0000-000000000008',
    fact_type: 'preference',
    content:
      'Er mag prägnante, direkte Antworten ohne lange Vorworte. Bei Entscheidungsfragen bevorzugt er eine klare Empfehlung mit kurzer Begründung statt einer ausführlichen Abwägung.',
    confidence: 0.93,
    source: 'feedback',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0009-0000-0000-000000000009',
    fact_type: 'context',
    content:
      'Zensation AI ist ein B2B-SaaS-Startup mit Sitz in München. Aktuell 12 Mitarbeiter, Seed-finanziert mit 1,5 Mio. EUR, MRR bei ca. 18.000 EUR, Ziel Series A im Q3 2026.',
    confidence: 0.96,
    source: 'conversation',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
  {
    id: 'e5f6a7b8-0010-0000-0000-000000000010',
    fact_type: 'preference',
    content:
      'Alexander vertraut der KI bei Recherche und Entwürfen, aber überprüft finanzielle und rechtliche Aussagen immer selbst. Er möchte bei wichtigen Entscheidungen immer das letzte Wort haben.',
    confidence: 0.9,
    source: 'feedback',
    context: 'demo',
    user_id: DEMO_USER_ID,
  },
];
