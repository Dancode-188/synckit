/**
 * Word Wall - Global shared word cloud with live voting
 *
 * Uses a single SyncDocument ("wordwall") with field-per-word.
 * Each word is stored as `word:{slug}` with text, votes, timestamps.
 * LWW per-field handles concurrent edits.
 */

import { useState, useEffect, useRef } from 'react';
import { useSyncKit } from '../contexts/SyncKitContext';
import { WordCosmos } from './WordCosmos';
import {
  parseWordsFromDocument,
  textToSlug,
  sanitizeInput,
  isOffensive,
  findWordToEvict,
  needsEviction,
  type WordEntry,
} from '../lib/wordwall';
// Use a stable anonymous ID for tracking submissions
function getAnonymousId(): string {
  const key = 'localwrite:anonymous-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, id);
  }
  return id;
}

const SUBMISSION_COOLDOWN_MS = 5000;
const VOTED_WORDS_KEY = 'localwrite:wordwall:voted';

interface WordWallProps {
  isConnected: boolean;
}

export function WordWall({ isConnected }: WordWallProps) {
  const { synckit } = useSyncKit();
  const [words, setWords] = useState<WordEntry[]>([]);
  const [input, setInput] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [votedWords, setVotedWords] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(VOTED_WORDS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [initialized, setInitialized] = useState(false);

  const docRef = useRef<any>(null);
  const lastSubmitTimeRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist voted words to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(VOTED_WORDS_KEY, JSON.stringify([...votedWords]));
    } catch {
      // localStorage might be full or unavailable
    }
  }, [votedWords]);

  // Initialize wordwall document
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function init() {
      try {
        const doc = synckit.document('wordwall');
        await doc.init();

        if (!mounted) return;
        docRef.current = doc;

        // Initial read
        const data = doc.get();
        if (data && mounted) {
          setWords(parseWordsFromDocument(data as Record<string, unknown>));
        }

        // Subscribe to changes
        unsubscribe = doc.subscribe((data: any) => {
          if (!mounted) return;
          setWords(parseWordsFromDocument(data as Record<string, unknown>));
        });

        setInitialized(true);
      } catch (err) {
        console.error('Failed to initialize word wall:', err);
        if (mounted) setError('Failed to connect to word wall');
      }
    }

    init();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [synckit]);

  // Cooldown timer
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    };
  }, []);

  const startCooldown = () => {
    lastSubmitTimeRef.current = Date.now();
    setCooldownRemaining(SUBMISSION_COOLDOWN_MS);

    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }

    cooldownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastSubmitTimeRef.current;
      const remaining = Math.max(0, SUBMISSION_COOLDOWN_MS - elapsed);
      setCooldownRemaining(remaining);

      if (remaining === 0 && cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    }, 100);
  };

  const handleSubmit = async () => {
    const doc = docRef.current;
    if (!doc || !input.trim()) return;

    // Cooldown check
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < SUBMISSION_COOLDOWN_MS) {
      setError(`Wait ${Math.ceil(cooldownRemaining / 1000)}s before submitting again`);
      return;
    }

    const text = sanitizeInput(input);
    if (!text) return;

    // Offensive word check
    if (isOffensive(text)) {
      setError('That word is not allowed');
      setInput('');
      return;
    }

    const slug = textToSlug(text);
    if (!slug) {
      setError('Invalid characters');
      return;
    }

    // Check if word already exists — if so, just vote for it
    const existing = words.find((w) => w.slug === slug);
    if (existing) {
      await handleVote(slug);
      setInput('');
      setError(null);
      startCooldown();
      return;
    }

    // Evict if at capacity
    if (needsEviction(words)) {
      const toEvict = findWordToEvict(words);
      if (toEvict) {
        await doc.set(`word:${toEvict.slug}`, { __deleted: true });
      }
    }

    await doc.set(`word:${slug}`, {
      text,
      votes: 1,
      submittedAt: now,
      submittedBy: getAnonymousId(),
    });

    // Auto-vote for own word
    setVotedWords((prev) => new Set([...prev, slug]));
    setInput('');
    setError(null);
    startCooldown();
  };

  const handleVote = async (slug: string) => {
    const doc = docRef.current;
    if (!doc || votedWords.has(slug)) return;

    const word = words.find((w) => w.slug === slug);
    if (!word) return;

    await doc.set(`word:${slug}`, {
      text: word.text,
      votes: word.votes + 1,
      submittedAt: word.submittedAt,
      submittedBy: word.submittedBy,
    });

    setVotedWords((prev) => new Set([...prev, slug]));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Word Wall content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Title */}
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Word Cosmos
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Add a word, vote for your favorites — watch them glow in the cosmos
            </p>
            {words.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {words.length} word{words.length !== 1 ? 's' : ''} floating in space
              </p>
            )}
          </div>

          {/* Word Cosmos */}
          {initialized ? (
            <div className="rounded-2xl overflow-hidden shadow-lg min-h-[350px]">
              <WordCosmos
                words={words}
                votedWords={votedWords}
                onVote={handleVote}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Input bar (fixed at bottom) */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value.slice(0, 30));
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a word or phrase..."
              maxLength={30}
              disabled={!isConnected || !initialized}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!isConnected || !initialized || !input.trim() || cooldownRemaining > 0}
              className="px-6 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors whitespace-nowrap"
            >
              {cooldownRemaining > 0
                ? `${Math.ceil(cooldownRemaining / 1000)}s`
                : 'Submit'}
            </button>
          </div>

          {/* Error / info messages */}
          <div className="flex items-center justify-between mt-2 min-h-[20px]">
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
              {input.length}/30
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
