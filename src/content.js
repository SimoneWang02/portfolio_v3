// Copy shared by the chibi and the chat panel.
export const NAME = "Simone Wang";
export const GREETING = "Hey there! I'm mini-Simone. Ask me anything.";
export const CHIPS = ["Who are you?", "What are you working on?", "How can I reach you?"];
export const LINKS = {
  linkedin: "https://www.linkedin.com/in/simone-wang-b7024a256",
  github: "https://github.com/SimoneWang02",
  handshake: "https://app.joinhandshake.com/profiles/tzpw2v",
  email: "mailto:simone.wang2002@gmail.com",
  cv: "/Simone_Resume.pdf", // served from public/
};

// Experience page timeline, from the résumé (public/Simone_Resume.pdf), newest first.
// Each stop: title = where, about = [what, location]; kind picks the marker icon.
// Bonobo's client projects hang off its stop, newest first: `summary` shows on the card, `points` on expand.
export const EXPERIENCE = [
  {
    kind: "school",
    title: "NYU Tandon School of Engineering",
    about: ["M.S. in Computer Science", "Brooklyn, NY"],
    dates: "Sep 2026 – Expected May 2028",
    courseworkLabel: "Current coursework",
    coursework: ["Information Visualization", "Big Data", "Design & Analysis of Algorithms I"],
  },
  {
    kind: "work",
    title: "Bonobo Srl",
    about: ["Web & Mobile Development Agency", "Modena, Italy"],
    dates: "Nov 2022 – May 2026",
    ladder: ["Intern", "Junior", "Senior"],
    growth: "Started as an intern and grew into owning client projects end-to-end, from client meetings to production deploys.",
    projects: [
      {
        name: "StartClaims",
        url: "https://start-claims.peritek.eu",
        about: "Insurance Claims Platform for Peritek Srl",
        dates: "Dec 2022 – May 2026",
        summary: "Tech lead for the merger of two multi-million-euro claims platforms; digitized the claims archive and built a GIS claims map.",
        tags: ["Angular", "Laravel", "API Integrations", "GIS Systems"],
        points: [
          "Appointed technical lead for a merger integrating StartClaims with a 30-year legacy loss-adjuster system, consolidating two multi-million-euro platforms; worked weekly onsite with the company owners, deployed production updates independently, and shaped roadmap priorities from workflow observation and stakeholder interviews.",
          "Digitized the full claims-archiving workflow, replacing paper-based Word templates with a web-based Digital Desk where adjusters create and manage documents entirely in-platform; benchmarked and optimized queries and automated repetitive tasks, raising throughput so Peritek could accept more claim assignments.",
          "Built an interactive GIS claims map on the Google Maps API - added lat/long fields through migrations, bulk-geocoded all historical claims, and implemented marker clustering to help surveyors optimize site-visit routes; integrated the Deep Property and Generali APIs to enrich assessments and automate assignment ingestion.",
          "Used AI-assisted development (OpenAI Codex) for rapid prototyping and debugging while keeping manual code review and testing in the loop for production reliability.",
        ],
      },
      {
        name: "DOCpack",
        url: "https://docpack.it",
        about: "Cloud Platform for Packaging Design Teams",
        dates: "Apr 2025 – Sep 2025",
        summary: "Led development, then supervised a junior developer; rebuilt the proposal viewer on the Adobe PDF Embed API.",
        tags: ["React", "NestJS", "Adobe PDF Embed API"],
        points: [
          "Led development for the first two months, then supervised a junior developer while coordinating roadmap execution, bimonthly releases, and client testing cycles.",
          "Rebuilt the proposal viewer on the Adobe PDF Embed API with annotation tools, faster client-side loading, and richer markup controls; implemented the full job-reporting module (services, controllers, DTOs, migrations) so teams could submit photo reports through the API.",
          "Extended job search with customer-level filters wired through shared hooks, and reverse-engineered complex packaging workflows from the legacy system to translate required features faithfully.",
        ],
      },
      {
        name: "DuePalleggi",
        url: "https://www.duepalleggi.it",
        about: "Sports Facility Reservation Platform",
        dates: "Oct 2023 – Jan 2025",
        summary: "Shipped a major release for a platform with 5.5M+ bookings and 125K+ users; it became my B.S. capstone thesis.",
        tags: ["React Native", "Laravel"],
        points: [
          "Modernized an outdated mobile app to match the continuously evolving web platform: refreshed UI/UX, repaired broken discount logic, fixed booking failures, and resolved data-display inconsistencies.",
          "Delivered a major production release including indexed-club booking, ICS calendar attachments, refined mail systems, secure change-password and change-email flows, and faster club data generation; repaired edge cases such as bookings through inactive clubs and incorrect split-payment logic.",
          "Managed Android releases via Google Play Console and CI/CD web deployments through GitLab pipelines; mentored high-school interns through code review, task assignment, and early CS career guidance.",
          "Made this work the subject of my B.S. capstone thesis under Prof. Nicola Capodieci (score 104/110), documenting 25+ features, 4 new REST APIs, and 50+ commits against production scale (5,525,000+ bookings; 125,000+ users; 1,200+ clubs; 3,600+ fields) and analyzing architectural decisions, mobile release management, and UI/UX consistency; presented to a commission including Prof. Marco Bertogna, a platform user.",
        ],
      },
      {
        name: "Iscrizioni Coop Accento",
        url: "https://iscrizioni.coopaccento.it",
        about: "Regional Summer Camp Online Enrollment Portal",
        dates: "Mar 2023 – Nov 2024",
        summary: "Turned an overwhelming registration form into a multi-step enrollment flow and built the Carta Docente voucher module.",
        tags: ["Laravel", "Blade", "SOAP"],
        points: [
          "Rebuilt an overwhelming registration form into a multi-step enrollment flow, improving clarity and ease of completion for parents.",
          "Delivered the Carta Docente voucher module, integrating SOAP services, and user-facing modals for teachers redeeming credits.",
          "Strengthened child-data validation (age mismatches, disability/allergy info, mandatory guardian information) and payment rules (early-bird, sibling discounts, IBAN checks); rebuilt director dashboards with year/center filters and historic-child toggles.",
          "Mentored interns while handling bug fixes and managing incoming feature requests through Trello.",
        ],
      },
    ],
  },
  {
    kind: "school",
    title: "University of Modena and Reggio Emilia",
    about: ["B.S. in Computer Science", "Modena, Italy"],
    dates: "Sep 2021 – Oct 2024",
    grade: "Final Grade: 104/110 (US GPA 3.78/4.00)",
    // exams from the official transcript (Certificato di Laurea), CS first, then math & science
    coursework: [
      "Programming 1", "Programming 2", "Programming Complements", "Object Programming",
      "Data Structures and Algorithms", "Computer Architecture", "Operating Systems", "Protocols and Network",
      "Languages and Compilers", "Databases", "Information Management", "Web Technologies",
      "Learning and Development in Artificial Systems",
      "Linear Algebra", "Mathematical Analysis", "Numerical Calculus", "Integer Linear Optimization",
      "Statistics and Elements of Probability", "Physics",
    ],
  },
];

// Projects page cards: independent work, newest first (by start date).
// image: a path under public/ (e.g. "/projects/foo.jpg", ~16:9); leave it null and the card shows a tinted placeholder.
// type: Freelance / Startup / Personal, shown as a pill by the dates.
// summary shows on the card; points open under "Show details" (add as many as you like).
// repo / url are optional; each one that's set becomes a link on the card.
export const PROJECTS = [
  {
    name: "mini-Simone",
    type: "Personal",
    about: "Interactive 3D Portfolio with an AI Chat Companion",
    dates: "Oct 2026",
    image: null,
    summary: "This site: a rigged 3D chibi that waves, high-fives, and lip-syncs to an AI chat as its answers stream in.",
    points: [
      "Rigged a 3D character (Tripo mesh + Mixamo skeleton) in Three.js and optimized it to 1.2 MB with glTF-Transform (meshopt geometry, WebP textures).",
      "Animated it procedurally in code rather than with baked clips: breathing, hops with squash & stretch, a hello wave, and a high-five that searches arm poses so the palm lands on the visitor's click.",
      "Wrote a custom face shader injected into the model's material for blinking eyelids and a talking mouth, and dropped the normal map across the face to remove lighting halos around painted features.",
      "Built the chat on a small Python server that streams DeepSeek replies and keeps the API key off the client; the chibi's moods (thinking, talking, nodding on punctuation) follow the stream as it arrives.",
      "Kept the chibi and the conversation alive across pages in a React Router SPA, shrinking the character into an animated corner companion away from the home page.",
    ],
    tags: ["React", "Three.js", "GLSL", "Python"],
    repo: "https://github.com/SimoneWang02/portfolio_v3",
    url: "",
  },
  {
    name: "Yocigaci",
    type: "Freelance",
    about: "Trading Card Game E-Commerce Platform",
    dates: "Jun 2026 – Jul 2026",
    image: null,
    summary: "Production storefront for a trading card shop in Carpi, Italy: 28 orders (€3,600) in the first month.",
    points: [
      "Designed, built, and operated a production storefront for a trading card shop in Carpi, Italy; live since launch with 28 orders (€3,600) in the first month.",
      "Shipped a multi-game catalog with faceted search and card-language filtering, a cart that survives reloads, and guest Stripe checkout supporting coupons, preorders, limited editions, selectable shipping, in-store pickup, and a public per-order tracking page.",
      "Hardened the Laravel REST API with server-side price recomputation, unguessable order numbers, transactional email to buyers and staff, and separate rate limits on auth, checkout, and tracking routes.",
      "Built a React control panel so the owner runs the business code-free - products, orders, coupons, shipping, homepage sections, banners, and curated mini-catalogs with drag-and-drop ordering, image uploads, and PDF receipts; handled SEO via JSON-LD, Googlebot prerendering, and a generated sitemap.",
    ],
    tags: ["Laravel", "React", "Stripe"],
    repo: "",
    url: "https://yocigaci.com",
  },
  {
    name: "MeeTea&Poke",
    type: "Freelance",
    about: "Click & Collect Ordering Platform",
    dates: "May 2026",
    image: null,
    summary: "Takeaway ordering for a poke bowl and bubble tea shop: 320 orders (€7,200) in its first three months.",
    points: [
      "Sole developer of a takeaway-ordering system for a poke bowl and bubble tea shop in Italy; live and processing 320 orders (€7,200) in its first three months.",
      "Built a React 19 SPA with a multi-step order wizard (customizable poke bowls, bubble teas, snacks, drinks), a persistent cart, and pickup time-slot booking with per-slot capacity limits, backed by a Laravel REST API with server-side pricing, daily order numbering, and rate limiting; added a Filament admin panel for code-free menu and order management.",
      "Wrote a native Kotlin Android app that runs as a foreground service, polls for new orders, and auto-prints receipts on a Sunmi thermal printer; handled JSON-LD SEO, a WebP image pipeline, and Dockerized deployment behind nginx.",
    ],
    tags: ["Laravel", "React", "Kotlin"],
    repo: "",
    url: "https://meetea-poke.com",
  },
  {
    name: "Awaqe Academy",
    type: "Startup",
    about: "Web Platform for Students and Mentors",
    dates: "Feb 2026 – Present",
    image: null,
    summary: "Lead developer of the first production prototype, collaborating with industry mentors from J.P. Morgan & Google.",
    points: [
      "Built and independently deployed the first production prototype on AWS EC2, covering firewall configuration, Nginx setup, runtime dependencies, and DNS routing.",
      "Designed the initial architecture for goal tracking, student progress visibility, and mentor-facing features, including a calendar-based interface for application planning; communicated technical constraints and timelines directly to non-technical founders.",
    ],
    tags: ["React", "Laravel", "AWS EC2"],
    repo: "",
    url: "https://awaqe.com",
  },
];
