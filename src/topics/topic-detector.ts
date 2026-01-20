import type { Topic, TopicDetection, TopicSwitch } from "./types.js";
import { getDefaultLogger } from "../logger/index.js";

// ============================================
// TOPIC DEFINITIONS
// ============================================
const TOPIC_DEFINITIONS: Topic[] = [
  {
    id: "technology",
    name: "Technology",
    keywords: [
      "computer",
      "software",
      "code",
      "programming",
      "tech",
      "app",
      "website",
      "digital",
      "internet",
      "ai",
      "algorithm",
    ],
    description: "Discussion about technology, software, computers, and digital tools",
  },
  {
    id: "food",
    name: "Food & Dining",
    keywords: [
      "food",
      "restaurant",
      "cooking",
      "recipe",
      "dinner",
      "lunch",
      "breakfast",
      "cuisine",
      "taste",
      "meal",
    ],
    description: "Discussion about food, restaurants, cooking, and dining experiences",
  },
  {
    id: "travel",
    name: "Travel",
    keywords: [
      "travel",
      "trip",
      "vacation",
      "journey",
      "destination",
      "visit",
      "explore",
      "adventure",
      "flight",
      "hotel",
    ],
    description: "Discussion about travel, trips, and visiting places",
  },
  {
    id: "work",
    name: "Work & Career",
    keywords: [
      "work",
      "job",
      "career",
      "office",
      "colleague",
      "project",
      "meeting",
      "boss",
      "client",
      "professional",
    ],
    description: "Discussion about work, career, and professional life",
  },
  {
    id: "hobbies",
    name: "Hobbies & Interests",
    keywords: [
      "hobby",
      "interest",
      "pastime",
      "activity",
      "sport",
      "music",
      "art",
      "reading",
      "gaming",
      "collection",
    ],
    description: "Discussion about hobbies, interests, and leisure activities",
  },
  {
    id: "philosophy",
    name: "Philosophy & Ideas",
    keywords: [
      "think",
      "idea",
      "meaning",
      "purpose",
      "belief",
      "philosophy",
      "theory",
      "concept",
      "perspective",
      "opinion",
    ],
    description: "Discussion about philosophy, ideas, and abstract concepts",
  },
  {
    id: "personal",
    name: "Personal Life",
    keywords: [
      "family",
      "friend",
      "home",
      "personal",
      "life",
      "relationship",
      "feeling",
      "emotion",
      "experience",
    ],
    description: "Discussion about personal life, relationships, and experiences",
  },
  {
    id: "entertainment",
    name: "Entertainment",
    keywords: [
      "movie",
      "show",
      "book",
      "music",
      "concert",
      "entertainment",
      "media",
      "film",
      "series",
      "performance",
    ],
    description: "Discussion about movies, shows, books, music, and entertainment",
  },
  {
    id: "general",
    name: "General Conversation",
    keywords: [
      "hello",
      "hi",
      "how",
      "what",
      "where",
      "when",
      "why",
      "conversation",
      "chat",
      "talk",
    ],
    description: "General conversation and small talk",
  },
];

// ============================================
// TOPIC DETECTOR
// ============================================
export class TopicDetector {
  private topics: Topic[];
  private logger = getDefaultLogger();

  constructor(customTopics?: Topic[]) {
    this.topics = customTopics || TOPIC_DEFINITIONS;
    this.logger.debug("Topic detector initialized", {
      topicCount: this.topics.length,
      topics: this.topics.map((t) => t.name),
    });
  }

  /**
   * Detect topics in a message
   */
  detectTopics(message: string, turnNumber: number): TopicDetection {
    const words = message.toLowerCase().split(/\s+/);
    const wordCount = words.length;
    const uniqueWords = new Set(words).size;

    const detectedTopics: Array<Topic & { matchCount: number; relevanceScore: number }> = [];

    // Check each topic for keyword matches
    for (const topic of this.topics) {
      let matchCount = 0;
      for (const keyword of topic.keywords) {
        const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, "g");
        const matches = message.toLowerCase().match(regex);
        if (matches) {
          matchCount += matches.length;
        }
      }

      if (matchCount > 0) {
        // Calculate relevance score based on match count and message length
        const relevanceScore = Math.min(1, matchCount / (wordCount * 0.1));
        detectedTopics.push({
          ...topic,
          matchCount,
          relevanceScore,
        });
      }
    }

    // Sort by relevance
    detectedTopics.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const dominantTopic = detectedTopics[0];
    const topicConfidence = dominantTopic ? dominantTopic.relevanceScore : 0;

    // Simple sentiment analysis (basic keyword-based)
    const positiveWords = [
      "good",
      "great",
      "wonderful",
      "amazing",
      "love",
      "enjoy",
      "happy",
      "excited",
    ];
    const negativeWords = [
      "bad",
      "terrible",
      "awful",
      "hate",
      "sad",
      "angry",
      "disappointed",
      "worried",
    ];

    let positiveCount = 0;
    let negativeCount = 0;
    for (const word of words) {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
    }

    let sentiment: "positive" | "neutral" | "negative" = "neutral";
    if (positiveCount > negativeCount) sentiment = "positive";
    else if (negativeCount > positiveCount) sentiment = "negative";

    // Extract topic without matchCount for detectedTopics
    const cleanedDetectedTopics: Topic[] = detectedTopics.map(
      ({ matchCount: _matchCount, ...topic }) => topic
    );

    // Extract dominantTopic without matchCount if it exists
    let cleanedDominantTopic: Topic | undefined;
    if (dominantTopic) {
      const { matchCount: _matchCount, ...topic } = dominantTopic;
      cleanedDominantTopic = topic;
    }

    const detection: TopicDetection = {
      detectedTopics: cleanedDetectedTopics,
      ...(cleanedDominantTopic && { dominantTopic: cleanedDominantTopic }),
      topicConfidence,
      messageAnalysis: {
        wordCount,
        uniqueWords,
        sentiment,
      },
    };

    this.logger.debug("Topic detected", {
      turnNumber,
      messageLength: message.length,
      dominantTopic: dominantTopic?.name,
      topicConfidence,
      detectedTopicCount: detectedTopics.length,
      sentiment,
    });

    return detection;
  }

  /**
   * Detect if a topic switch occurred
   */
  detectTopicSwitch(
    previousDetection: TopicDetection,
    currentDetection: TopicDetection,
    turnNumber: number
  ): TopicSwitch | null {
    const previousTopic = previousDetection.dominantTopic;
    const currentTopic = currentDetection.dominantTopic;

    // No switch if both have same topic or one is missing
    if (!previousTopic || !currentTopic) {
      return null;
    }

    if (previousTopic.id === currentTopic.id) {
      return null;
    }

    // Determine switch type based on confidence
    let switchType: "natural" | "suggested" | "forced";
    const confidence = currentDetection.topicConfidence;

    if (confidence > 0.5) {
      switchType = "natural";
    } else if (confidence > 0.3) {
      switchType = "suggested";
    } else {
      switchType = "forced";
    }

    const topicSwitch: TopicSwitch = {
      fromTopic: previousTopic,
      toTopic: currentTopic,
      switchType,
      confidence,
      reason: `Topic naturally transitioned from "${previousTopic.name}" to "${currentTopic.name}"`,
    };

    this.logger.info("Topic switch detected", {
      turnNumber,
      fromTopic: previousTopic.name,
      toTopic: currentTopic.name,
      switchType,
      confidence,
      reason: topicSwitch.reason,
    });

    return topicSwitch;
  }

  /**
   * Get all available topics
   */
  getAllTopics(): Topic[] {
    return [...this.topics];
  }
}
