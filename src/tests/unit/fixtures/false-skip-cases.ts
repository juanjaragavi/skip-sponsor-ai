/**
 * Abridged transcripts of the false skips found in the 2026-10-16 release
 * precision test (docs/eval/2026-10-16-release-precision.md), plus true
 * sponsor reads from the same test that the guards must keep. Key lines are
 * quoted as captured (auto-captions, typos included); topic filler between
 * them is shortened. The candidate is what Claude returned for the video.
 * Offline fixtures: no network, no model call.
 */
import type { LlmChunk, LlmSegmentCandidate } from "../../../shared/types";

export interface FalseSkipCase {
  /** YouTube video id the case comes from. */
  videoId: string;
  note: string;
  cues: LlmChunk[];
  candidate: LlmSegmentCandidate;
}

/** Filler cues about the video's own topic, one per `step` seconds. */
function topic(
  from: number,
  to: number,
  step: number,
  text: (i: number) => string,
): LlmChunk[] {
  const out: LlmChunk[] = [];
  for (let t = from, i = 0; t < to; t += step, i++)
    out.push({ t0: t, t1: Math.min(t + step, to), text: text(i) });
  return out;
}

const sponsor = (
  o: Partial<LlmSegmentCandidate> &
    Pick<LlmSegmentCandidate, "start" | "end" | "advertiser" | "evidence">,
): LlmSegmentCandidate => ({
  category: "sponsor",
  confidence: 0.95,
  relationship: "third_party_sponsor",
  breaksFromContent: true,
  ...o,
});

/**
 * Failure mode 2: a one-line disclosure followed by real content, skipped as
 * one 68 s block (34-102). The paid Nebula read itself comes at the end.
 */
export const disclosureThenContent: FalseSkipCase = {
  videoId: "gK-7TKC7kvY",
  note: "one-line disclosure, then the video's topic",
  cues: [
    {
      t0: 22,
      t1: 29.5,
      text: "But this means we can now take a look at what the AI industry actually looks like.",
    },
    { t0: 29.5, t1: 31.1, text: "Is this a bubble?" },
    { t0: 31.1, t1: 32.4, text: "Will it burst?" },
    { t0: 32.4, t1: 34, text: "Let's take a look." },
    { t0: 34, t1: 35.8, text: "This video is sponsored by Nebula." },
    {
      t0: 35.8,
      t1: 41,
      text: "I think by now many people have heard that ChatBT has been the fastest app to reach 1 billion users.",
    },
    {
      t0: 41,
      t1: 44,
      text: "And even on phones, this has been remarkably quick, right?",
    },
    {
      t0: 44,
      t1: 48.1,
      text: "So this is just mobile users on iOS and the Google Play Store.",
    },
    {
      t0: 48.1,
      t1: 54,
      text: "And here they've reached this in 3 years, which is significantly faster than any other app",
    },
    { t0: 54, t1: 56.4, text: "in history. I think this is pretty wellnown." },
    {
      t0: 56.4,
      t1: 64.5,
      text: "But while Chad GPT was absolutely dominant in the early days of AI they've also continued to grow.",
    },
    { t0: 64.5, t1: 66.2, text: "They do have some real competition now." },
    {
      t0: 66.2,
      t1: 70.9,
      text: "There's Google Gemini that stands out especially which now has well over 600 million users.",
    },
    {
      t0: 70.9,
      t1: 80,
      text: "Obviously, they gained this in part because they pushed Gemini into existing Google products.",
    },
    {
      t0: 80,
      t1: 85.3,
      text: "But it was also done partially by Gemini just catching up with chat GPT and capabilities over time.",
    },
    {
      t0: 85.3,
      t1: 88,
      text: "But the second big standout here is very obviously",
    },
    {
      t0: 88,
      t1: 96,
      text: "Anthropics Claw. They now have well over 200 million active users without the early lead.",
    },
    {
      t0: 96,
      t1: 102,
      text: "And without the massive breath [music] and catalog of products that Google had.",
    },
    {
      t0: 102,
      t1: 106.2,
      text: "So that means they've achieved this mostly by just having a product that people actually wanted.",
    },
    ...topic(
      106.2,
      1380,
      6,
      (i) =>
        `The data on AI revenue and compute spending keeps going, part ${i}.`,
    ),
    {
      t0: 1380,
      t1: 1386,
      text: "And if you want more videos like this one, Nebula is where I put them first.",
    },
    {
      t0: 1386,
      t1: 1392,
      text: "Nebula is a creator-owned streaming service with no ads.",
    },
    {
      t0: 1392,
      t1: 1398,
      text: "Sign up at nebula.tv slash this channel for 40% off the annual plan.",
    },
    {
      t0: 1398,
      t1: 1496.5,
      text: "Thanks for watching and see you next time.",
    },
  ],
  candidate: sponsor({
    start: 34,
    end: 102,
    advertiser: "Nebula",
    evidence: "This video is sponsored by Nebula.",
  }),
};

/**
 * Failure mode 1: a fully sponsored video (the sponsor's watch is the topic).
 * Its intro, which names the sponsor, was skipped as a read (0-27).
 */
export const fullySponsoredIntro: FalseSkipCase = {
  videoId: "dw6U6GROEpY",
  note: "fully sponsored video: the intro names the sponsor whose product is the topic",
  cues: [
    {
      t0: 0,
      t1: 4,
      text: "He venido a Santiago con Samsung para poner a prueba su nuevo Galaxy Watch Ultra 2.",
    },
    {
      t0: 4,
      t1: 7,
      text: "Y es que vamos a hacer parte del camino, que tengo aquí varias",
    },
    {
      t0: 7,
      t1: 12.8,
      text: "cositas preparadas y también vamos a hacer rafting, algo que no he hecho nunca jamás en la vida.",
    },
    {
      t0: 12.8,
      t1: 18.7,
      text: "Y también una clase de yoga, lo voy [música] a medir todo y registrar todas las actividades con el reloj.",
    },
    {
      t0: 18.7,
      t1: 23,
      text: "También lo voy a estar utilizando mientras duermo. Y os contaré también qué tal aguanta la batería con",
    },
    { t0: 23, t1: 27.1, text: "sesiones así tan activas de deporte." },
    {
      t0: 27.1,
      t1: 34,
      text: "Nos vemos en unos días y os sigo [música] contando.",
    },
    {
      t0: 34,
      t1: 38.7,
      text: "Día uno de esta experiencia con Samsung para probar el nuevo Galaxy Watch Ultra 2.",
    },
    ...topic(
      38.7,
      230,
      6,
      (i) => `Seguimos caminando hacia Santiago, etapa ${i}.`,
    ),
    {
      t0: 230,
      t1: 236,
      text: "La app de Samsung Health me dice que hoy he caminado veinte kilómetros.",
    },
    ...topic(236, 480, 6, (i) => `Hoy toca rafting en el río, tramo ${i}.`),
    {
      t0: 480,
      t1: 486,
      text: "El reloj de Samsung ha medido el ritmo cardíaco durante todo el descenso.",
    },
    ...topic(486, 700, 6, (i) => `La clase de yoga va muy bien, postura ${i}.`),
    {
      t0: 700,
      t1: 706,
      text: "Por la noche el Samsung me registra las fases del sueño.",
    },
    ...topic(706, 950, 6, (i) => `Llegamos a la catedral, minuto ${i}.`),
    { t0: 950, t1: 958.4, text: "Gracias a Samsung por esta experiencia." },
  ],
  candidate: sponsor({
    start: 0,
    end: 27.1,
    advertiser: "Samsung",
    breaksFromContent: false,
    evidence:
      "He venido a Santiago con Samsung para poner a prueba su nuevo Galaxy Watch Ultra 2.",
  }),
};

/** Failure mode 1: the disclosure inside the intro of a fully sponsored phone review (58-70). */
export const fullySponsoredDisclosure: FalseSkipCase = {
  videoId: "HmJYxPLgFds",
  note: "fully sponsored review: the disclosure line about the reviewed phone's maker",
  cues: [
    ...topic(
      0,
      39,
      6,
      (i) => `Todo mundo está falando de bateria de celular, parte ${i}.`,
    ),
    {
      t0: 39,
      t1: 46.9,
      text: "fizeram teste de bateria com os principais smartphones no mercado e o Oppo Fine X9 Pro venceu os dois.",
    },
    {
      t0: 46.9,
      t1: 51.9,
      text: "No teste do Mr. Who the Boss, ele durou uma hora mais que o segundo colocado.",
    },
    { t0: 51.9, t1: 54.2, text: "OK, agora você tem a minha tensão." },
    {
      t0: 54.2,
      t1: 58.2,
      text: "Vezes do seria muito legal testar esse smartphone, pensei.",
    },
    {
      t0: 58.2,
      t1: 64,
      text: "E aí a Oppo entrou em contato comigo para me mandar um Find X9 Pro que tá na minha",
    },
    {
      t0: 64,
      t1: 70,
      text: "mão agora. E pior ou melhor, eles disseram que queriam patrocinar um vídeo aqui no canal sobre o Find X9 Pro.",
    },
    {
      t0: 70,
      t1: 74.5,
      text: "Então, senhoras e senhores, esse é o meu vídeo sobre o Oppo Findine X9 Pro.",
    },
    { t0: 74.5, t1: 77, text: "Nós vamos falar de três coisas sobre ele." },
    ...topic(77, 180, 6, (i) => `Primeiro a câmera, foto ${i}.`),
    {
      t0: 180,
      t1: 186,
      text: "A câmera periscópio da Oppo segura bem o zoom de dez vezes.",
    },
    ...topic(186, 400, 6, (i) => `Agora a bateria, teste ${i}.`),
    {
      t0: 400,
      t1: 406,
      text: "A Oppo usa uma bateria de silício-carbono aqui.",
    },
    ...topic(406, 620, 6, (i) => `E por fim o desempenho, jogo ${i}.`),
    { t0: 620, t1: 626, text: "No geral, o Oppo surpreendeu nos jogos." },
    ...topic(626, 830, 6, (i) => `Conclusão, ponto ${i}.`),
    { t0: 830, t1: 839.9, text: "Valeu, Oppo, e até o próximo vídeo." },
  ],
  candidate: sponsor({
    start: 58.2,
    end: 70,
    advertiser: "Oppo",
    evidence: "a Oppo entrou em contato comigo para me mandar um Find X9 Pro",
  }),
};

// ---------------------------------------------------------------------------
// True sponsor reads from the same test; the guards must keep them.

/** A read that names the sponsor once, then describes it, then a call to action (zgPOenXO7Vg). */
export const realReadOneMention: FalseSkipCase = {
  videoId: "zgPOenXO7Vg",
  note: "real read: one sponsor mention, long description, link at the end",
  cues: [
    ...topic(
      0,
      124,
      6,
      (i) => `The new handheld is finally here, detail ${i}.`,
    ),
    {
      t0: 124,
      t1: 132,
      text: "Before that, this video is brought to you by Lexar's Play series of micro SD cards available in capacities 256 GB and up",
    },
    {
      t0: 132,
      t1: 140,
      text: "that can easily move games between compatible Linux systems that support portable hot swap game installs",
    },
    {
      t0: 140,
      t1: 147,
      text: "devices. Why? Because per device storage needs during our dystopian times of consumer shortages require",
    },
    {
      t0: 147,
      t1: 153.7,
      text: "creative solutions like allowing fewer portable cards at a lower total cost.",
    },
    {
      t0: 153.7,
      t1: 157.7,
      text: "Again, particularly with Linux builds that are compatible with portable games.",
    },
    {
      t0: 157.7,
      t1: 163,
      text: "We've been using Lexar's Play Series micro SD cards for some of our smaller high FPS action cameras that",
    },
    {
      t0: 163,
      t1: 167.3,
      text: "we use for counting frames in benchmarking processes and haven't had any issues with them.",
    },
    {
      t0: 167.3,
      t1: 170,
      text: "Learn more at the link in the description below. Corsair's",
    },
    ...topic(
      170,
      900,
      6,
      (i) => `Back to the handheld review, benchmark ${i}.`,
    ),
  ],
  candidate: sponsor({
    start: 124,
    end: 167.3,
    advertiser: "Lexar",
    evidence:
      "this video is brought to you by Lexar's Play series of micro SD cards",
  }),
};

/** A short disclosure plus a pointer to the read at the end (fbxKRyDhLdg, fr). */
export const shortDisclosure: FalseSkipCase = {
  videoId: "fbxKRyDhLdg",
  note: "real: two-line disclosure, labelled as sponsor",
  cues: [
    ...topic(
      0,
      22.3,
      4,
      (i) => `On parle de santé mentale aujourd'hui, partie ${i}.`,
    ),
    { t0: 22.3, t1: 24, text: "Cette vidéo est sponsorisée par Odou." },
    { t0: 24, t1: 28, text: "Plus d'informations en fin de vidéo." },
    ...topic(
      28,
      1900,
      6,
      (i) => `Alors là, je commence à expliquer le concept, partie ${i}.`,
    ),
  ],
  candidate: sponsor({
    start: 22.3,
    end: 28,
    advertiser: "Odou",
    evidence: "Cette vidéo est sponsorisée par Odou.",
  }),
};

/** An integration whose name is mangled by the captions after the disclosure (RYY0ibk4s60). */
export const integrationWithCallToAction: FalseSkipCase = {
  videoId: "RYY0ibk4s60",
  note: "real: disclosure, a minute of product demo without the name, link at the end",
  cues: [
    ...topic(0, 178, 6, (i) => `Setting up the home lab network, step ${i}.`),
    {
      t0: 178,
      t1: 184,
      text: "Now, this part of the video is sponsored by Twgate.",
    },
    ...topic(
      184,
      238,
      6,
      (i) =>
        `It gives you zero trust remote access to the lab without opening ports, feature ${i}.`,
    ),
    { t0: 238, t1: 244, text: "Check it out. I got a link below." },
    ...topic(
      244,
      900,
      6,
      (i) => `Back to the switch configuration, port ${i}.`,
    ),
  ],
  candidate: sponsor({
    start: 178,
    end: 244,
    advertiser: "Twgate",
    evidence: "this part of the video is sponsored by Twgate",
  }),
};

/** A read, an intro disclosure and an outro thank-you for the same sponsor: not a fully sponsored video. */
export const readWithIntroAndOutro: FalseSkipCase = {
  videoId: "8JvIJUHvQvQ",
  note: "real: the sponsor is named in the intro, the read and the outro",
  cues: [
    {
      t0: 0,
      t1: 6,
      text: "Thanks to Ground News for sponsoring today's video.",
    },
    ...topic(6, 261, 6, (i) => `The history of the canal, chapter ${i}.`),
    {
      t0: 261,
      t1: 268,
      text: "Speaking of news, Ground News shows you every side of a story.",
    },
    {
      t0: 268,
      t1: 275,
      text: "Ground News rates each outlet's bias and factuality.",
    },
    {
      t0: 275,
      t1: 282,
      text: "Go to ground.news slash canal for 40% off the Vantage plan.",
    },
    { t0: 282, t1: 288, text: "Back to the canal." },
    ...topic(288, 950, 6, (i) => `The canal today, part ${i}.`),
    {
      t0: 950,
      t1: 960,
      text: "Thanks again to Ground News, and see you next time.",
    },
  ],
  candidate: sponsor({
    start: 261,
    end: 282,
    advertiser: "Ground News",
    evidence: "Go to ground.news slash canal for 40% off",
  }),
};

/** A partner whose name contains a common word that recurs in the video (d3rWcej83WQ, fr). */
export const advertiserWithCommonWord: FalseSkipCase = {
  videoId: "d3rWcej83WQ",
  note: "real: partner disclosure; the common word 'festival' recurs on its own",
  cues: [
    {
      t0: 0,
      t1: 7.4,
      text: "Cette vidéo est réalisée en partenariat avec le festival des Misselliades pour lequel je serai en tournée.",
    },
    {
      t0: 7.4,
      t1: 11,
      text: "Plus d'infos en description et plus d'infos à la fin de la vidéo.",
    },
    ...topic(
      11,
      990,
      30,
      (i) =>
        `Le festival de musique et le festival de cinéma parlent d'effondrement, idée ${i}.`,
    ),
  ],
  candidate: sponsor({
    start: 0,
    end: 11,
    advertiser: "Festival des Misselliades",
    breaksFromContent: false,
    evidence:
      "Cette vidéo est réalisée en partenariat avec le festival des Misselliades",
  }),
};

/**
 * A read the model split in two (TnE7QoaH74U): the first part names the
 * sponsor once and ends before the offer, which the second part carries.
 */
export const splitReadOfferAfterEnd: FalseSkipCase = {
  videoId: "TnE7QoaH74U",
  note: "real: read split in two, the offer comes after the first part",
  cues: [
    ...topic(0, 1108, 6, (i) => `Talking about sinuses, story ${i}.`),
    {
      t0: 1108,
      t1: 1113.4,
      text: "below. So, I'm married and um my wife and I have very different sleep schedules.",
    },
    ...topic(
      1113.4,
      1155,
      6,
      (i) => `I sleep downstairs with the TV on, reason ${i}.`,
    ),
    {
      t0: 1155,
      t1: 1159,
      text: "However, it has not been as much of a thing lately thanks to this video sponsor, Mantis Sleep.",
    },
    {
      t0: 1159,
      t1: 1163,
      text: "They make sleep masks, which I've never really been that fond of sleep masks, to be honest.",
    },
    ...topic(
      1163,
      1234,
      6,
      (i) => `The deep eye cups and the soft foam padding, detail ${i}.`,
    ),
    {
      t0: 1234,
      t1: 1238.3,
      text: "And again, in the middle of the day, there was a lot of light coming in through the window.",
    },
    {
      t0: 1238.3,
      t1: 1242,
      text: "I threw this bad boy on and seriously it [music] it made all the difference. I am a fan.",
    },
    { t0: 1242, t1: 1244, text: "And they have multiple types of masks." },
    {
      t0: 1244,
      t1: 1248,
      text: "they have a cooled mask that can actually help relieve sinus headaches.",
    },
    {
      t0: 1248,
      t1: 1257,
      text: "they are offering 10% off of their masks if you visit through this link in the description",
    },
    {
      t0: 1257,
      t1: 1263,
      text: "really been a big mask guy, but this one has kind of won me over.",
    },
    ...topic(1263, 1500, 6, (i) => `Back to sinuses, question ${i}.`),
  ],
  candidate: sponsor({
    start: 1108,
    end: 1234,
    advertiser: "Mantis Sleep",
    evidence: "thanks to this video sponsor, Mantis Sleep",
  }),
};
