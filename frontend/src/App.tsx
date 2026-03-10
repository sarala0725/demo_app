import React from 'react';
import './App.css';

type RobotConfig = {
  hair: 'hair_01' | 'hair_02' | 'hair_03' | 'hair_04' | 'hair_05' | 'hair_06';
  accessory: 'accessory_01' | 'accessory_02' | 'accessory_03' | 'accessory_04' | 'accessory_05' | 'accessory_06';
};

type Robot = {
  id: string;
  name: string;
  config: RobotConfig;
  createdAt: string;
};

type QuizQuestion = {
  type: 'mcq' | 'fill_in_blank' | 'true_false' | 'short_answer';
  difficulty?: 'easy' | 'medium' | 'hard';
  prompt: string;
  choices?: string[];
  answer: string;
  explanation?: string;
  source?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'robot';
  text: string;
  structured?: {
    focus?: string;
    explanation?: string;
    example?: string;
    practice?: string | {
      sentence_with_blank?: string;
      correct_answer?: string;
      wrong_options?: string[];
      prompt?: string;
      answer?: string;
    };
    highlights?: string[];
    teaching?: {
      title?: string;
      pattern?: string;
      rule?: string;
      steps?: string[];
      breakdown?: { part?: string; function?: string }[];
      examples?: { native?: string; zh?: string }[];
      practice?: {
        prompt?: string;
        answer?: string;
        sentence_with_blank?: string;
        correct_answer?: string;
        wrong_options?: string[];
      };
    };
    title?: string;
    cards?: {
      term?: string;
      zh?: string;
      meaning?: string;
      exampleNative?: string;
      exampleZh?: string;
      example?: string;
      note?: string;
    }[];
    next_steps?: string;
  };
  createdAt: number;
};

const defaultConfig: RobotConfig = {
  hair: 'hair_01',
  accessory: 'accessory_01',
};

type Asset = {
  id: RobotConfig[keyof RobotConfig];
  label: string;
  src: string;
};

const baseBodySrc = '/assets/base/face.svg';

const hairAssets: Asset[] = [
  {
    id: 'hair_01',
    label: '髮型 1',
    src: '/assets/hair/hair_01.svg',
  },
  {
    id: 'hair_02',
    label: '髮型 2',
    src: '/assets/hair/hair_02.svg',
  },
  {
    id: 'hair_03',
    label: '髮型 3',
    src: '/assets/hair/hair_03.svg',
  },
  {
    id: 'hair_04',
    label: '髮型 4',
    src: '/assets/hair/hair_04.svg',
  },
  {
    id: 'hair_05',
    label: '髮型 5',
    src: '/assets/hair/hair_05.svg',
  },
  {
    id: 'hair_06',
    label: '髮型 6',
    src: '/assets/hair/hair_06.svg',
  },
];

const accessoryAssets: Asset[] = [
  {
    id: 'accessory_01',
    label: '配件 1',
    src: '/assets/accessory/accessory_01.svg',
  },
  {
    id: 'accessory_02',
    label: '配件 2',
    src: '/assets/accessory/accessory_02.svg',
  },
  {
    id: 'accessory_03',
    label: '配件 3',
    src: '/assets/accessory/accessory_03.svg',
  },
  {
    id: 'accessory_04',
    label: '配件 4',
    src: '/assets/accessory/accessory_04.svg',
  },
  {
    id: 'accessory_05',
    label: '配件 5',
    src: '/assets/accessory/accessory_05.svg',
  },
  {
    id: 'accessory_06',
    label: '配件 6',
    src: '/assets/accessory/accessory_06.svg',
  },
];

function OptionGrid<T extends string>(props: {
  title: string;
  value: T;
  options: { id: T; label: string; src: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 700, textAlign: 'left' }}>{props.title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {props.options.map((opt) => {
          const active = opt.id === props.value;
          return (
            <button
              key={opt.id}
              onClick={() => props.onChange(opt.id)}
              style={{
                border: active ? '2px solid #1B5FB2' : '1px solid #d3d3d3',
                borderRadius: 12,
                background: 'white',
                padding: 10,
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <img
                src={opt.src}
                alt={opt.label}
                style={{ width: '100%', height: 78, objectFit: 'contain', display: 'block' }}
              />
              <div style={{ marginTop: 6, fontSize: 12 }}>{opt.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RobotAvatar(props: { config: RobotConfig }) {
  const size = 36;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: '1px solid #e3e3e3',
        background: 'white',
        position: 'relative',
        overflow: 'hidden',
        flex: '0 0 auto',
      }}
      aria-label="robot avatar"
    >
      <img
        src={hairAssets.find((a) => a.id === props.config.hair)?.src || ''}
        alt="hair"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <img
        src={baseBodySrc}
        alt="face"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <img
        src={accessoryAssets.find((a) => a.id === props.config.accessory)?.src || ''}
        alt="accessory"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}

function DelayedReveal(props: { children: React.ReactNode }) {
  const [revealed, setRevealed] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !revealed) {
          // Delay slightly so it feels like a natural reading progression
          const timer = setTimeout(() => setRevealed(true), 800);
          return () => clearTimeout(timer);
        }
      },
      { threshold: 1.0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [revealed]);

  return (
    <>
      <div ref={ref} style={{ height: 1 }} />
      <div
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0)' : 'translateY(10px)',
          transition: 'all 0.6s ease',
          pointerEvents: revealed ? 'auto' : 'none',
          height: revealed ? 'auto' : 0,
          overflow: 'hidden',
          marginTop: revealed ? 8 : 0,
        }}
      >
        {props.children}
      </div>
    </>
  );
}

function RobotPreview(props: { config: RobotConfig }) {
  return (
    <div
      style={{
        width: 260,
        height: 320,
        borderRadius: 16,
        border: '1px solid #ccc',
        background: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <img
        src={hairAssets.find((a) => a.id === props.config.hair)?.src || ''}
        alt="hair"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <img
        src={baseBodySrc}
        alt="face"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <img
        src={accessoryAssets.find((a) => a.id === props.config.accessory)?.src || ''}
        alt="accessory"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}

function normalizeConfig(input: any): RobotConfig {
  const hairIds = new Set(hairAssets.map((a) => a.id));
  const accIds = new Set(accessoryAssets.map((a) => a.id));
  const c = input && typeof input === 'object' ? input : {};

  const hairMap: Record<string, RobotConfig['hair']> = {
    hair_short: 'hair_01',
    hair_long: 'hair_02',
    hair_bun: 'hair_03',
    hair_01: 'hair_01',
    hair_02: 'hair_02',
    hair_03: 'hair_03',
    hair_04: 'hair_04',
    hair_05: 'hair_05',
    hair_06: 'hair_06',
  };

  const accessoryMap: Record<string, RobotConfig['accessory']> = {
    acc_none: 'accessory_01',
    acc_hat: 'accessory_02',
    acc_bag: 'accessory_03',
    accessory_01: 'accessory_01',
    accessory_02: 'accessory_02',
    accessory_03: 'accessory_03',
    accessory_04: 'accessory_04',
    accessory_05: 'accessory_05',
    accessory_06: 'accessory_06',
  };

  const mappedHair = hairMap[String(c.hair || '')] || defaultConfig.hair;
  const mappedAccessory = accessoryMap[String(c.accessory || '')] || defaultConfig.accessory;

  return {
    hair: hairIds.has(mappedHair) ? mappedHair : defaultConfig.hair,
    accessory: accIds.has(mappedAccessory) ? mappedAccessory : defaultConfig.accessory,
  };
}

const API_BASE_URL = 'https://demo-app-hs6a.onrender.com';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
  const res = await fetch(fullUrl, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init && init.headers ? init.headers : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function apiUpload<T>(url: string, file: File): Promise<T> {
  const fullUrl = url.startsWith('/') ? `${API_BASE_URL}${url}` : url;
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(fullUrl, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

function App() {
  const [view, setView] = React.useState<'setup' | 'chat'>('setup');
  const [config, setConfig] = React.useState<RobotConfig>(defaultConfig);
  const [robotName, setRobotName] = React.useState('');
  const [robots, setRobots] = React.useState<Robot[]>([]);
  const [selectedRobotId, setSelectedRobotId] = React.useState<string>('');
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const [hasUploaded, setHasUploaded] = React.useState(false);
  const [learningLanguage, setLearningLanguage] = React.useState('');

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = React.useState('');
  const [promptChips, setPromptChips] = React.useState<string[]>([]);

  const selectedRobot = React.useMemo(
    () => robots.find((r) => r.id === selectedRobotId) || null,
    [robots, selectedRobotId]
  );

  const selectedRobotConfig = React.useMemo(() => normalizeConfig(selectedRobot?.config), [selectedRobot]);

  const loadRobots = React.useCallback(async () => {
    const data = await apiJson<{ robots: Robot[] }>('/api/robots');
    setRobots(data.robots || []);
    if (!selectedRobotId && data.robots && data.robots[0]) {
      setSelectedRobotId(data.robots[0].id);
    }
  }, [selectedRobotId]);

  React.useEffect(() => {
    loadRobots().catch((e) => setError(e.message || String(e)));
  }, [loadRobots]);

  const onSaveRobot = async () => {
    setError('');
    setBusy('saving');
    try {
      const created = await apiJson<Robot>('/api/robots', {
        method: 'POST',
        body: JSON.stringify({ name: robotName.trim(), config }),
      });
      setRobotName('');
      await loadRobots();
      setSelectedRobotId(created.id);
      setHasUploaded(false);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const onUpload = async () => {
    if (!selectedRobotId) {
      setError('請先選擇一個機器人');
      return;
    }
    if (!file) {
      setError('請先選擇 PDF 或 Excel 檔案');
      return;
    }
    setError('');
    setBusy('upload');
    try {
      const resp = await apiUpload<{ language?: string }>(`/api/robots/${selectedRobotId}/documents`, file);
      if (resp && resp.language) {
        setLearningLanguage(resp.language);
      }
      setFile(null);
      setHasUploaded(true);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const onSetupComplete = () => {
    if (!selectedRobotId) {
      setError('請先選擇一個機器人');
      return;
    }
    if (!hasUploaded) {
      setError('請先上傳教材（PDF/Excel）');
      return;
    }

    setError('');
    setView('chat');
    setPromptChips([]);
    setMessages([
      {
        id: crypto.randomUUID(),
        role: 'robot',
        createdAt: Date.now(),
        text: '正在為您閱讀並整理教材重點，請稍候...',
      },
    ]);
  };

  const defaultPromptChips = React.useMemo(
    () => [
      '教材重點整理',
      '單詞練習',
      '填空題練習',
      '教材複習',
    ],
    []
  );

  React.useEffect(() => {
    const run = async () => {
      if (view !== 'chat') return;
      if (!selectedRobotId) return;
      try {
        const data = await apiJson<{ prompts?: string[], greeting?: string }>(
          `/api/robots/${selectedRobotId}/prompt-chips`,
          { method: 'GET' }
        );
        const prompts = Array.isArray(data.prompts) ? data.prompts.filter((p) => String(p || '').trim()) : [];
        setPromptChips(prompts.length ? prompts : defaultPromptChips);

        // Update the loading message text if a dynamic greeting is returned
        if (data.greeting && Array.isArray(messages) && messages.length > 0) {
          setMessages((prev) => {
            const arr = [...prev];
            // Update the very first message which was our loading placeholder
            if (arr.length > 0 && arr[0].text === '正在為您閱讀並整理教材重點，請稍候...') {
              arr[0].text = String(data.greeting);
            }
            return arr;
          });
        }
      } catch {
        setPromptChips(defaultPromptChips);
        setMessages((prev) => {
          const arr = [...prev];
          if (arr.length > 0 && arr[0].text === '正在為您閱讀並整理教材重點，請稍候...') {
            arr[0].text = 'HI, 我是你的族語小老師, 會協助你一起學習族語！ (導讀載入失敗)';
          }
          return arr;
        });
      }
    };
    run();
  }, [view, selectedRobotId, defaultPromptChips]);

  const appendMessage = React.useCallback((m: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        ...m,
      },
    ]);
  }, []);

  const generateQuizReply = React.useCallback(async () => {
    if (!selectedRobotId) throw new Error('robot not selected');
    const data = await apiJson<{ quiz: { questions: QuizQuestion[] } }>(
      `/api/robots/${selectedRobotId}/quiz/generate`,
      { method: 'POST' }
    );
    const qs = (data.quiz && data.quiz.questions) || [];
    if (qs.length === 0) {
      return '我沒有從教材中抽到適合出題的句子。你可以換一份教材，或上傳包含較多句子的內容。';
    }

    const labelType = (t: QuizQuestion['type']) => {
      if (t === 'mcq') return '選擇題';
      if (t === 'true_false') return '是非題';
      if (t === 'short_answer') return '簡答題';
      return '填空題';
    };
    const labelDifficulty = (d?: QuizQuestion['difficulty']) => {
      if (d === 'easy') return '簡單';
      if (d === 'medium') return '中等';
      if (d === 'hard') return '困難';
      return '';
    };

    return qs
      .slice(0, 8)
      .map((q, i) => {
        const headParts = [labelType(q.type)];
        const dl = labelDifficulty(q.difficulty);
        if (dl) headParts.push(dl);
        const head = headParts.length ? `（${headParts.join(' / ')}）` : '';

        const lines: string[] = [];
        lines.push(`${i + 1}. ${q.prompt}${head}`);
        if (q.type === 'mcq' && Array.isArray(q.choices) && q.choices.length) {
          for (const c of q.choices.slice(0, 4)) lines.push(`- ${c}`);
        }
        lines.push(`答案：${q.answer}`);
        if (q.explanation && q.explanation.trim()) lines.push(`解析：${q.explanation.trim()}`);
        if (q.source && q.source.trim()) lines.push(`出處：${q.source.trim()}`);
        return lines.join('\n');
      })
      .join('\n\n');
  }, [selectedRobotId]);

  const askQa = React.useCallback(
    async (question: string) => {
      if (!selectedRobotId) throw new Error('robot not selected');
      const data = await apiJson<{ answer: string; structured?: ChatMessage['structured'] }>(
        `/api/robots/${selectedRobotId}/qa`,
        {
          method: 'POST',
          body: JSON.stringify({ question }),
        }
      );
      return { answer: data.answer || '', structured: data.structured };
    },
    [selectedRobotId]
  );

  const onSendChat = React.useCallback(
    async (text: string) => {
      const t = (text || '').trim();
      if (!t) return;
      setError('');
      appendMessage({ role: 'user', text: t });
      setChatInput('');

      const shouldQuiz = /出題|題目|填空|選擇|測驗|quiz/i.test(t);
      setBusy('chat');
      try {
        if (shouldQuiz) {
          const reply = await generateQuizReply();
          appendMessage({
            role: 'robot',
            text: `好的，這裡是我根據你上傳的教材產生的題目：\n\n${reply}`,
          });
          return;
        }

        const qa = await askQa(t);
        appendMessage({
          role: 'robot',
          text:
            qa.answer || '我目前找不到教材中相關的內容。你可以換個問法或上傳更完整的教材。',
          structured: qa.structured,
        });
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        setBusy('');
      }
    },
    [appendMessage, generateQuizReply, askQa]
  );

  const renderRichText = React.useCallback((text: string) => {
    const input = String(text || '');
    const re = /!\[([^\]]*)\]\(([^)]+)\)|「([^」]+)」|【([^】]+)】/g;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      if (m.index > last) nodes.push(input.slice(last, m.index));

      if (m[0].startsWith('![')) {
        nodes.push(
          <img
            key={`${m.index}-${re.lastIndex}`}
            src={m[2]}
            alt={m[1] || 'image'}
            style={{ maxWidth: '100%', borderRadius: 8, display: 'block', margin: '8px 0' }}
          />
        );
      } else {
        const token = (m[3] || m[4] || '').trim();
        if (token) {
          nodes.push(
            <span
              key={`${m.index}-${re.lastIndex}`}
              style={{
                fontWeight: 800,
                fontSize: 15,
                background: '#f1f1f1',
                padding: '2px 6px',
                borderRadius: 6,
                display: 'inline-block',
              }}
            >
              {token}
            </span>
          );
        } else {
          nodes.push(m[0]);
        }
      }
      last = re.lastIndex;
    }
    if (last < input.length) nodes.push(input.slice(last));
    return nodes;
  }, []);

  // ── CollapsibleExample (single row) ──────────────────────────────────────
  const CollapsibleExample = ({
    native, zh, rrt, index,
  }: {
    native: string; zh: string;
    rrt: (t: string) => React.ReactNode[];
    index: number;
  }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: '1px solid #d6d6d6',
            borderRadius: 999, padding: '4px 10px',
            fontSize: 12, cursor: 'pointer', width: 'fit-content',
            color: '#555',
          }}
        >
          <span>{open ? '▾' : '▸'}</span>
          {open ? `例句 ${index + 1}` : `點擊看例句 ${index + 1}`}
        </button>
        {open && (
          <div style={{ paddingLeft: 8, display: 'grid', gap: 2 }}>
            {native ? <div style={{ whiteSpace: 'pre-wrap' }}>{rrt(native)}</div> : null}
            {zh ? <div style={{ whiteSpace: 'pre-wrap', opacity: 0.8 }}>→ {rrt(zh)}</div> : null}
          </div>
        )}
      </div>
    );
  };

  // ── CollapsibleExamples (list) ────────────────────────────────────────────
  const CollapsibleExamples = React.useCallback(
    ({ examples, renderRichText: rrt }: {
      examples: { native?: string; zh?: string }[];
      renderRichText: (t: string) => React.ReactNode[];
    }) => {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          {examples.slice(0, 6).map((ex, i) => {
            const native = (ex && ex.native ? String(ex.native) : '').trim();
            const zh = (ex && ex.zh ? String(ex.zh) : '').trim();
            if (!native && !zh) return null;
            return <CollapsibleExample key={`${i}-${native}`} native={native} zh={zh} rrt={rrt} index={i} />;
          })}
        </div>
      );
    },
    []
  );

  // ── VocabCard ─────────────────────────────────────────────────────────────
  const VocabCard = ({
    card, renderRichText: rrt,
  }: {
    card: {
      term: string; zh: string; meaning: string;
      exampleNative: string; exampleZh: string;
      example: string; note: string;
    };
    renderRichText: (t: string) => React.ReactNode[];
  }) => {
    const hasExample = !!(card.exampleNative || card.example);
    const [showEx, setShowEx] = React.useState(false);
    return (
      <div style={{
        border: '1px solid #e5e5e5', borderRadius: 10, padding: 10,
        background: '#fff', display: 'grid', gap: 6,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{rrt(card.term)}</div>
          {card.zh || card.meaning ? (
            <div style={{ opacity: 0.9 }}>{rrt(card.zh || card.meaning)}</div>
          ) : null}
        </div>
        {card.note ? <div style={{ fontSize: 12, opacity: 0.7 }}>{rrt(card.note)}</div> : null}
        {hasExample && (
          <>
            <button
              onClick={() => setShowEx((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: '1px solid #d6d6d6',
                borderRadius: 999, padding: '3px 8px',
                fontSize: 11, cursor: 'pointer', width: 'fit-content',
                color: '#555',
              }}
            >
              <span>{showEx ? '▾' : '▸'}</span>
              {showEx ? '收起例句' : '看例句'}
            </button>
            {showEx && (
              <div style={{ display: 'grid', gap: 4, paddingLeft: 4 }}>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{rrt(card.exampleNative || card.example)}</div>
                {card.exampleZh ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, opacity: 0.8 }}>→ {rrt(card.exampleZh)}</div> : null}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const DragDropPractice = ({ practice }: { practice: any }) => {

    const p = practice;
    const sentence = String(p.sentence_with_blank || '').trim();
    const correct = String(p.correct_answer || '').trim();
    const wrongs = Array.isArray(p.wrong_options) ? p.wrong_options : [];

    const [filled, setFilled] = React.useState<string | null>(null);
    const [isCorrect, setIsCorrect] = React.useState<boolean | null>(null);

    // Shuffle options once
    const options = React.useMemo(() => {
      const all = [correct, ...wrongs].filter(Boolean);
      return all.sort(() => Math.random() - 0.5);
    }, [correct, wrongs]);

    if (!sentence || !correct) return null;

    const parts = sentence.split('___');

    const handleDrop = (option: string) => {
      setFilled(option);
      setIsCorrect(option === correct);
    };

    return (
      <div style={{ display: 'grid', gap: 12, padding: 16, background: '#f8f9fa', borderRadius: 12, border: '1px solid #e9ecef' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#495057' }}>🧩 拖曳單字填空練習</div>

        {/* Sentence Area */}
        <div style={{ fontSize: 16, lineHeight: 1.6 }}>
          {parts.map((part, i) => (
            <React.Fragment key={i}>
              {renderRichText(part)}
              {i < parts.length - 1 && (
                <span
                  style={{
                    display: 'inline-block',
                    minWidth: 80,
                    minHeight: 28,
                    margin: '0 6px',
                    padding: filled ? '2px 8px' : 0,
                    border: filled ? 'none' : '2px dashed #adb5bd',
                    background: filled ? (isCorrect ? '#d4edda' : '#f8d7da') : 'transparent',
                    color: filled ? (isCorrect ? '#155724' : '#721c24') : 'inherit',
                    borderRadius: 6,
                    verticalAlign: 'bottom',
                    textAlign: 'center',
                    fontWeight: filled ? 700 : 'normal',
                    boxShadow: filled ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.2s',
                    cursor: filled && !isCorrect ? 'pointer' : 'default'
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(e.dataTransfer.getData('text/plain')); }}
                  onClick={() => { if (filled && !isCorrect) { setFilled(null); setIsCorrect(null); } }}
                >
                  {filled || ''}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Feedback Area */}
        {filled && (
          <div style={{ fontSize: 14, fontWeight: 700, color: isCorrect ? '#28a745' : '#dc3545', marginTop: -4 }}>
            {isCorrect ? '✨ 答對了！太棒了！' : '❌ 不太對喔，點擊空格把卡片拿下來再試一次吧！'}
          </div>
        )}

        {/* Options Area */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          {options.map((opt, i) => {
            const isUsed = filled === opt;
            return (
              <div
                key={i}
                draggable={!isUsed && !isCorrect}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', opt)}
                onClick={() => { if (!isUsed && !isCorrect) handleDrop(opt); }}
                style={{
                  padding: '6px 12px',
                  background: isUsed ? '#e9ecef' : '#fff',
                  border: isUsed ? '1px solid #dee2e6' : '1px solid #ced4da',
                  color: isUsed ? '#adb5bd' : '#495057',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: isUsed || isCorrect ? 'default' : 'grab',
                  boxShadow: isUsed ? 'none' : '0 2px 5px rgba(0,0,0,0.05)',
                  userSelect: 'none'
                }}
              >
                {opt}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const StructuredAnswer = React.useCallback(
    (props: { data: NonNullable<ChatMessage['structured']> }) => {
      const d = props.data || {};
      const teaching = d.teaching && typeof d.teaching === 'object' ? d.teaching : null;

      if (teaching) {
        const t = teaching as NonNullable<ChatMessage['structured']>['teaching'];
        const title = (t?.title || '').trim();
        const pattern = (t?.pattern || '').trim();
        const rule = (t?.rule || '').trim();
        const steps = Array.isArray(t?.steps) ? t!.steps!.map((s) => String(s || '').trim()).filter(Boolean) : [];
        const breakdown = Array.isArray(t?.breakdown) ? t!.breakdown! : [];
        const examples = Array.isArray(t?.examples) ? t!.examples! : [];
        const practice = t?.practice && typeof t.practice === 'object' ? t.practice : null;

        const section = (label: string, body: React.ReactNode) => (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>{label}</div>
            <div>{body}</div>
          </div>
        );

        return (
          <div style={{ display: 'grid', gap: 12 }}>
            {title ? <div style={{ fontWeight: 900, fontSize: 16 }}>{renderRichText(title)}</div> : null}

            {pattern || rule ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {pattern ? section('句型', <div style={{ whiteSpace: 'pre-wrap' }}>{renderRichText(pattern)}</div>) : null}
                {rule ? section('規律', <div style={{ whiteSpace: 'pre-wrap' }}>{renderRichText(rule)}</div>) : null}
              </div>
            ) : null}

            {steps.length ? (
              section(
                '一步一步',
                <div style={{ display: 'grid', gap: 6 }}>
                  {steps.slice(0, 6).map((s, i) => (
                    <div key={`${i}-${s}`} style={{ display: 'flex', gap: 8 }}>
                      <div style={{ width: 18, fontWeight: 900 }}>{i + 1}.</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{renderRichText(s)}</div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {breakdown.length ? (
              section(
                '句型拆解',
                <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      background: '#fafafa',
                      fontWeight: 800,
                      padding: '8px 10px',
                      fontSize: 12,
                    }}
                  >
                    <div>結構</div>
                    <div>功能</div>
                  </div>
                  {breakdown.slice(0, 12).map((r, idx) => {
                    const part = (r && r.part ? String(r.part) : '').trim();
                    const fn = (r && (r as any).function ? String((r as any).function) : '').trim();
                    if (!part && !fn) return null;
                    return (
                      <div
                        key={`${idx}-${part}-${fn}`}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 10px', borderTop: '1px solid #eee' }}
                      >
                        <div style={{ whiteSpace: 'pre-wrap' }}>{renderRichText(part)}</div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{renderRichText(fn)}</div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}

            {examples.length ? (
              section(
                '例句',
                <CollapsibleExamples examples={examples} renderRichText={renderRichText} />
              )
            ) : null}

            {practice &&
              (practice.sentence_with_blank || String(practice.prompt || '').trim() || String(practice.answer || '').trim())
              ? section(
                '練習',
                practice.sentence_with_blank ? (
                  <DragDropPractice practice={practice} />
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {String(practice.prompt || '').trim() ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{renderRichText(String(practice.prompt || '').trim())}</div>
                    ) : null}
                    {String(practice.answer || '').trim() ? (
                      <div style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>答案：{renderRichText(String(practice.answer || '').trim())}</div>
                    ) : null}
                  </div>
                )
              )
              : null}

            {d.next_steps && typeof d.next_steps === 'string' ? (
              <DelayedReveal>
                <div style={{ padding: '12px 14px', background: '#eef2ff', borderRadius: 8, borderLeft: '4px solid #4f46e5', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16 }}>🚀</span>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#4f46e5' }}>下一步建議</div>
                    <div style={{ fontSize: 14, color: '#312e81', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{renderRichText(d.next_steps.trim())}</div>
                  </div>
                </div>
              </DelayedReveal>
            ) : null}
          </div>
        );
      }

      const cards = Array.isArray(d.cards) ? d.cards : [];

      if (cards.length > 0) {
        const items = cards
          .map((c) => ({
            term: (c && c.term ? String(c.term) : '').trim(),
            zh: (c && (c as any).zh ? String((c as any).zh) : '').trim(),
            meaning: (c && (c as any).meaning ? String((c as any).meaning) : '').trim(),
            exampleNative: (c && (c as any).exampleNative ? String((c as any).exampleNative) : '').trim(),
            exampleZh: (c && (c as any).exampleZh ? String((c as any).exampleZh) : '').trim(),
            example: (c && (c as any).example ? String((c as any).example) : '').trim(),
            note: (c && (c as any).note ? String((c as any).note) : '').trim(),
          }))
          .filter((c) => c.term);

        return (
          <div style={{ display: 'grid', gap: 10 }}>
            {d.title && String(d.title).trim() ? (
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>{renderRichText(String(d.title).trim())}</div>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {items.slice(0, 20).map((c, idx) => (
                <VocabCard key={`${c.term}-${idx}`} card={c} renderRichText={renderRichText} />
              ))}
            </div>

            {d.next_steps && typeof d.next_steps === 'string' ? (
              <DelayedReveal>
                <div style={{ padding: '12px 14px', background: '#eef2ff', borderRadius: 8, borderLeft: '4px solid #4f46e5', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16 }}>🚀</span>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#4f46e5' }}>下一步建議</div>
                    <div style={{ fontSize: 14, color: '#312e81', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{renderRichText(d.next_steps.trim())}</div>
                  </div>
                </div>
              </DelayedReveal>
            ) : null}
          </div>
        );
      }

      const row = (label: string, value?: string) => {
        const v = (value || '').trim();
        if (!v) return null;
        return (
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>{label}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{renderRichText(v)}</div>
          </div>
        );
      };

      return (
        <div style={{ display: 'grid', gap: 10 }}>
          {row('重點', d.focus)}
          {row('解釋', d.explanation)}
          {row('例句', d.example)}
          {d.practice && typeof d.practice === 'object' && d.practice.sentence_with_blank ? (
            <DragDropPractice practice={d.practice} />
          ) : (
            row('小練習', typeof d.practice === 'string' ? d.practice : d.practice?.prompt)
          )}

          {d.next_steps && typeof d.next_steps === 'string' ? (
            <DelayedReveal>
              <div style={{ padding: '12px 14px', background: '#eef2ff', borderRadius: 8, borderLeft: '4px solid #4f46e5', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16 }}>🚀</span>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#4f46e5' }}>下一步建議</div>
                  <div style={{ fontSize: 14, color: '#312e81', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{renderRichText(d.next_steps.trim())}</div>
                </div>
              </div>
            </DelayedReveal>
          ) : null}
        </div>
      );
    },
    [renderRichText]
  );

  return (
    <div className="App" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f7f9', fontFamily: 'sans-serif', padding: '16px 20px', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          {view === 'chat' && (
            <button
              onClick={() => {
                setView('setup');
                setMessages([]);
                setChatInput('');
              }}
              style={{
                background: 'transparent',
                border: '1px solid #ccc',
                color: '#555',
                padding: '4px 10px',
                fontSize: 13,
                boxShadow: 'none',
              }}
            >
              ← 返回設定
            </button>
          )}
          {view === 'chat' ? `${learningLanguage || '族語'}學習測試` : '族語學習測試'}
        </h1>
      </div>

      {error ? (
        <div style={{ background: '#ffe7e7', color: '#7a0b0b', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      {view === 'setup' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>1) 設計你的機器人</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
                <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                  <div style={{ fontWeight: 700, textAlign: 'left' }}>預覽（搭配結果）</div>
                  <RobotPreview config={config} />
                </div>

                <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                  <OptionGrid
                    title="髮型"
                    value={config.hair}
                    options={hairAssets as any}
                    onChange={(id) => setConfig({ ...config, hair: id as any })}
                  />
                  <OptionGrid
                    title="配件"
                    value={config.accessory}
                    options={accessoryAssets as any}
                    onChange={(id) => setConfig({ ...config, accessory: id as any })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 14 }}>
                <input
                  value={robotName}
                  onChange={(e) => setRobotName(e.target.value)}
                  placeholder="幫你的機器人命名"
                />
                <button
                  onClick={onSaveRobot}
                  disabled={!robotName.trim() || busy === 'saving'}
                  style={{ padding: '8px 12px' }}
                >
                  {busy === 'saving' ? '儲存中...' : '儲存'}
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>2) 上傳教材並完成設定</h2>

              <label style={{ display: 'grid', gap: 6, textAlign: 'left' }}>
                <div>選擇機器人</div>
                <select
                  value={selectedRobotId}
                  onChange={(e) => {
                    setSelectedRobotId(e.target.value);
                    setHasUploaded(false);
                  }}
                >
                  <option value="">(尚未選擇)</option>
                  {robots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedRobot ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, textAlign: 'left' }}>
                  目前機器人：<b>{selectedRobot.name}</b>
                </div>
              ) : null}

              <div style={{ marginTop: 12, display: 'grid', gap: 10, textAlign: 'left' }}>

                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls"
                  onChange={(e) => {
                    setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null);
                    setHasUploaded(false);
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={onUpload}
                    disabled={busy === 'upload' || !file}
                    style={{
                      padding: '8px 16px',
                      opacity: busy === 'upload' || !file ? 0.6 : 1,
                      cursor: busy === 'upload' || !file ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {busy === 'upload' ? '上傳中...' : '上傳教材'}
                  </button>
                  {hasUploaded && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#27ae60', display: 'flex', alignItems: 'center', gap: 4 }}>
                      ✨ 教材已上傳完成
                    </div>
                  )}
                </div>

                <div style={{ padding: '12px 0 0 0', borderTop: '1px solid #eee', marginTop: 8 }}>
                  <button
                    onClick={onSetupComplete}
                    disabled={!hasUploaded}
                    style={{
                      padding: '10px 16px',
                      width: '100%',
                      fontSize: 15,
                      fontWeight: 700,
                      background: hasUploaded ? '#1B5FB2' : '#e0e0e0',
                      color: hasUploaded ? 'white' : '#888',
                      border: 'none',
                      opacity: hasUploaded ? 1 : 0.7,
                      cursor: hasUploaded ? 'pointer' : 'not-allowed',
                      boxShadow: hasUploaded ? '0 2px 5px rgba(27,95,178,0.3)' : 'none',
                    }}
                  >
                    設定完成
                  </button>
                  {!hasUploaded && (
                    <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'center', marginTop: 6, color: '#f39c12' }}>
                      請先上傳教材後再點「設定完成」
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto', width: '100%', minHeight: 0 }}>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 12, padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minHeight: 0 }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, paddingBottom: 8, borderBottom: '1px solid #eee' }}>
              <RobotAvatar config={selectedRobotConfig} />
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontWeight: 800, lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  對話視窗
                  {learningLanguage && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1B5FB2', background: '#e6f0ff', padding: '2px 6px', borderRadius: 4 }}>
                      📖 {learningLanguage}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedRobot?.name || '(未選擇)'} 的教學空間
                </div>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                border: '1px solid #e3e3e3',
                borderRadius: 12,
                padding: 12,
                overflowY: 'auto',
                background: '#fafafa',
              }}
            >
              {messages.length === 0 ? (
                <div style={{ opacity: 0.8, textAlign: 'left' }}>開始聊天吧！</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {messages
                    .filter(m => !(m.role === 'user' && (m.text === '立即開始' || m.text.includes('立即開始'))))
                    .map((m, msgIdx) => (
                      <React.Fragment key={m.id}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            gap: 8,
                            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          {m.role === 'robot' ? <RobotAvatar config={selectedRobotConfig} /> : null}
                          <div
                            style={{
                              maxWidth: '78%',
                              whiteSpace: 'pre-wrap',
                              padding: '10px 12px',
                              borderRadius: 12,
                              background: m.role === 'user' ? '#1B5FB2' : 'white',
                              color: m.role === 'user' ? 'white' : '#222',
                              border: m.role === 'user' ? 'none' : '1px solid #e3e3e3',
                              textAlign: 'left',
                              lineHeight: 1.6,
                            }}
                          >
                            {m.role === 'robot' && m.structured ? (
                              <StructuredAnswer data={m.structured} />
                            ) : (
                              renderRichText(m.text)
                            )}
                          </div>
                        </div>
                        {/* Start button: show below the FIRST robot message only */}
                        {m.role === 'robot' && msgIdx === 0 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 44 }}>
                            <button
                              onClick={() => onSendChat('立即開始')}
                              disabled={busy === 'chat'}
                              style={{
                                padding: '8px 20px',
                                borderRadius: 999,
                                border: 'none',
                                background: '#1B5FB2',
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 2px 5px rgba(27,95,178,0.3)',
                              }}
                            >
                              🚀 立即開始
                            </button>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                {['總結教材內容', '隨堂測驗', '單字學習', '語法學習'].map((p) => (
                  <button
                    key={p}
                    onClick={() => onSendChat(p)}
                    disabled={busy === 'chat'}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: '1px solid #d6d6d6',
                      background: 'white',
                      fontSize: 13,
                      color: '#444',
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="輸入你想問的內容..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSendChat(chatInput);
                    }
                  }}
                  style={{
                    padding: '14px 16px',
                    fontSize: 16,
                  }}
                />
                <button
                  onClick={() => onSendChat(chatInput)}
                  disabled={busy === 'chat' || !chatInput.trim()}
                  style={{
                    padding: '14px 20px',
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {busy === 'chat' ? '...' : '送出'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
