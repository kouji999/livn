--
-- PostgreSQL database dump
--

\restrict iRx7497IAVHMUBVuZtoSCXvkf8X4IPeNxesU3CceaeTjysx0DzgWTGy8V84PTgU

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AccountType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccountType" AS ENUM (
    'CASH',
    'BANK',
    'E_WALLET',
    'INVESTMENT',
    'CRYPTO',
    'CREDIT',
    'OTHER'
);


--
-- Name: AttachmentKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttachmentKind" AS ENUM (
    'IMAGE',
    'DOCUMENT',
    'LINK',
    'FILE'
);


--
-- Name: BudgetPeriod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BudgetPeriod" AS ENUM (
    'WEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'YEARLY'
);


--
-- Name: CategoryKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CategoryKind" AS ENUM (
    'INCOME',
    'EXPENSE',
    'TRANSFER'
);


--
-- Name: GoalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GoalStatus" AS ENUM (
    'PLANNED',
    'ACTIVE',
    'PAUSED',
    'ACHIEVED',
    'MISSED',
    'ARCHIVED'
);


--
-- Name: GoalType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GoalType" AS ENUM (
    'BINARY',
    'NUMERIC',
    'PERCENTAGE',
    'CURRENCY',
    'COUNT',
    'CUSTOM'
);


--
-- Name: HabitFrequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HabitFrequency" AS ENUM (
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'CUSTOM'
);


--
-- Name: HabitTracking; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HabitTracking" AS ENUM (
    'BOOLEAN',
    'COUNT',
    'DURATION',
    'QUANTITY'
);


--
-- Name: InsightSeverity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InsightSeverity" AS ENUM (
    'INFO',
    'POSITIVE',
    'WARNING',
    'CRITICAL'
);


--
-- Name: LifeEventCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LifeEventCategory" AS ENUM (
    'HEALTH',
    'CAREER',
    'FINANCE',
    'RELATIONSHIP',
    'LEARNING',
    'BUSINESS',
    'PERSONAL',
    'MILESTONE',
    'OTHER'
);


--
-- Name: MonthlyMetric; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MonthlyMetric" AS ENUM (
    'TASK_COMPLETION',
    'HABIT_SESSIONS',
    'SAVINGS_AMOUNT',
    'INCOME_AMOUNT',
    'EXPENSE_LIMIT',
    'CUSTOM'
);


--
-- Name: Priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Priority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


--
-- Name: ProjectStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProjectStatus" AS ENUM (
    'PLANNED',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'ARCHIVED'
);


--
-- Name: RecurrenceFrequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RecurrenceFrequency" AS ENUM (
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    'YEARLY'
);


--
-- Name: ReviewKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReviewKind" AS ENUM (
    'WEEKLY',
    'MONTHLY',
    'YEARLY'
);


--
-- Name: SavingsStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SavingsStatus" AS ENUM (
    'ACTIVE',
    'ACHIEVED',
    'PAUSED',
    'ARCHIVED'
);


--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'INBOX',
    'PLANNED',
    'TODAY',
    'COMPLETED',
    'SKIPPED',
    'ARCHIVED'
);


--
-- Name: TransactionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TransactionType" AS ENUM (
    'INCOME',
    'EXPENSE',
    'TRANSFER',
    'ADJUSTMENT'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Account" (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    type public."AccountType" DEFAULT 'CASH'::public."AccountType" NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    "openingBalance" bigint DEFAULT 0 NOT NULL,
    institution text,
    "accountNumberLast4" text,
    "colorToken" text DEFAULT 'accent'::text NOT NULL,
    "iconName" text,
    "closedAt" timestamp(3) without time zone,
    "archivedAt" timestamp(3) without time zone,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Area; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Area" (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    description text,
    "colorToken" text DEFAULT 'accent'::text NOT NULL,
    "iconName" text,
    "position" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Attachment" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "storageDriver" text DEFAULT 'local'::text NOT NULL,
    "storageKey" text NOT NULL,
    "fileName" text NOT NULL,
    "mimeType" text NOT NULL,
    "sizeBytes" integer NOT NULL,
    kind public."AttachmentKind" DEFAULT 'FILE'::public."AttachmentKind" NOT NULL,
    "externalUrl" text,
    checksum text,
    "journalEntryId" text,
    "lifeEventId" text,
    "transactionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: Budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Budget" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "periodStart" date NOT NULL,
    period public."BudgetPeriod" DEFAULT 'MONTHLY'::public."BudgetPeriod" NOT NULL,
    amount bigint NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    "categoryId" text,
    "areaId" text,
    "warnThreshold" numeric(4,3) DEFAULT 0.8 NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "parentId" text,
    name text NOT NULL,
    slug text NOT NULL,
    kind public."CategoryKind" DEFAULT 'EXPENSE'::public."CategoryKind" NOT NULL,
    "colorToken" text DEFAULT 'accent'::text NOT NULL,
    "iconName" text,
    "isSystem" boolean DEFAULT false NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Goal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Goal" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "areaId" text,
    title text NOT NULL,
    description text,
    "goalType" public."GoalType" DEFAULT 'BINARY'::public."GoalType" NOT NULL,
    "targetValue" numeric(18,4),
    "currentValue" numeric(18,4) DEFAULT 0 NOT NULL,
    unit text,
    "isDerived" boolean DEFAULT false NOT NULL,
    "derivationKey" text,
    "startDate" timestamp(3) without time zone,
    "targetDate" timestamp(3) without time zone,
    status public."GoalStatus" DEFAULT 'ACTIVE'::public."GoalStatus" NOT NULL,
    priority public."Priority" DEFAULT 'MEDIUM'::public."Priority" NOT NULL,
    notes text,
    "completedAt" timestamp(3) without time zone,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Habit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Habit" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "areaId" text,
    "goalId" text,
    name text NOT NULL,
    description text,
    frequency public."HabitFrequency" DEFAULT 'DAILY'::public."HabitFrequency" NOT NULL,
    "targetCount" integer DEFAULT 1 NOT NULL,
    "scheduleDays" integer[] DEFAULT ARRAY[]::integer[],
    "trackingMethod" public."HabitTracking" DEFAULT 'BOOLEAN'::public."HabitTracking" NOT NULL,
    unit text,
    "targetValue" numeric(18,4),
    "colorToken" text DEFAULT 'accent'::text NOT NULL,
    "iconName" text,
    "startDate" date NOT NULL,
    "endDate" date,
    "archivedAt" timestamp(3) without time zone,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: HabitLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."HabitLog" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "habitId" text NOT NULL,
    date date NOT NULL,
    completed boolean DEFAULT true NOT NULL,
    value numeric(18,4),
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Insight; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Insight" (
    id text NOT NULL,
    "userId" text NOT NULL,
    kind text NOT NULL,
    severity public."InsightSeverity" DEFAULT 'INFO'::public."InsightSeverity" NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    evidence jsonb,
    "periodStart" date,
    "periodEnd" date,
    "dismissedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: JournalEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JournalEntry" (
    id text NOT NULL,
    "userId" text NOT NULL,
    date date NOT NULL,
    title text,
    body text NOT NULL,
    mood integer,
    energy integer,
    focus integer,
    "wentWell" text,
    "wentPoorly" text,
    "changeNext" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: JournalEntryGoal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JournalEntryGoal" (
    "journalEntryId" text NOT NULL,
    "goalId" text NOT NULL
);


--
-- Name: JournalEntryProject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JournalEntryProject" (
    "journalEntryId" text NOT NULL,
    "projectId" text NOT NULL
);


--
-- Name: JournalTag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JournalTag" (
    "journalEntryId" text NOT NULL,
    "tagId" text NOT NULL
);


--
-- Name: LifeEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LifeEvent" (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    description text,
    date date NOT NULL,
    category public."LifeEventCategory" DEFAULT 'OTHER'::public."LifeEventCategory" NOT NULL,
    "isMilestone" boolean DEFAULT false NOT NULL,
    "areaId" text,
    "goalId" text,
    "projectId" text,
    "journalEntryId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: Milestone; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Milestone" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "projectId" text NOT NULL,
    title text NOT NULL,
    description text,
    "dueDate" timestamp(3) without time zone,
    "position" integer DEFAULT 0 NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: MonthlyPlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MonthlyPlan" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "monthStart" date NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: MonthlyPlanTarget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MonthlyPlanTarget" (
    id text NOT NULL,
    "monthlyPlanId" text NOT NULL,
    "userId" text NOT NULL,
    label text NOT NULL,
    metric public."MonthlyMetric" NOT NULL,
    "targetValue" numeric(18,4) NOT NULL,
    unit text,
    "habitId" text,
    "goalId" text,
    "areaId" text,
    "categoryId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Project" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "areaId" text,
    "goalId" text,
    title text NOT NULL,
    description text,
    status public."ProjectStatus" DEFAULT 'PLANNED'::public."ProjectStatus" NOT NULL,
    "startDate" timestamp(3) without time zone,
    "targetDate" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RecurringRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecurringRule" (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    frequency public."RecurrenceFrequency" NOT NULL,
    "interval" integer DEFAULT 1 NOT NULL,
    weekdays integer[] DEFAULT ARRAY[]::integer[],
    "dayOfMonth" integer,
    "monthOfYear" integer,
    "startsOn" date NOT NULL,
    "endsOn" date,
    exceptions text[] DEFAULT ARRAY[]::text[],
    "nextRunAt" date,
    "transactionType" public."TransactionType",
    amount bigint,
    "accountId" text,
    "toAccountId" text,
    "categoryId" text,
    description text,
    payee text,
    "taskTitle" text,
    "taskPriority" public."Priority",
    "taskEstimateMinutes" integer,
    "autoPost" boolean DEFAULT false NOT NULL,
    "leadDays" integer DEFAULT 0 NOT NULL,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Review" (
    id text NOT NULL,
    "userId" text NOT NULL,
    kind public."ReviewKind" NOT NULL,
    "periodStart" date NOT NULL,
    "periodEnd" date NOT NULL,
    snapshot jsonb NOT NULL,
    "whatWentWell" text,
    "whatDidNot" text,
    "whatShouldChange" text,
    "nextPriorities" text,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: SavingsGoal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SavingsGoal" (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    description text,
    "targetAmount" bigint NOT NULL,
    "currentAmount" bigint DEFAULT 0 NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    "accountId" text,
    "goalId" text,
    "targetDate" date,
    "startDate" date DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status public."SavingsStatus" DEFAULT 'ACTIVE'::public."SavingsStatus" NOT NULL,
    "colorToken" text DEFAULT 'accent'::text NOT NULL,
    "iconName" text,
    "completedAt" timestamp(3) without time zone,
    "archivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userAgent" text,
    "ipAddress" text
);


--
-- Name: Tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tag" (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Task" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "areaId" text,
    "goalId" text,
    "projectId" text,
    "milestoneId" text,
    title text NOT NULL,
    description text,
    notes text,
    status public."TaskStatus" DEFAULT 'INBOX'::public."TaskStatus" NOT NULL,
    priority public."Priority" DEFAULT 'MEDIUM'::public."Priority" NOT NULL,
    "dueDate" timestamp(3) without time zone,
    "scheduledFor" timestamp(3) without time zone,
    "estimatedMinutes" integer,
    "position" integer DEFAULT 0 NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "skippedAt" timestamp(3) without time zone,
    "archivedAt" timestamp(3) without time zone,
    "recurrenceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Transaction" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."TransactionType" NOT NULL,
    amount bigint NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    "fxRate" numeric(18,8),
    "accountId" text NOT NULL,
    "toAccountId" text,
    "categoryId" text,
    "occurredAt" timestamp(3) without time zone NOT NULL,
    "occurredOn" date NOT NULL,
    description text,
    payee text,
    notes text,
    "recurringRuleId" text,
    "isProjected" boolean DEFAULT false NOT NULL,
    "reversesTransactionId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    "displayName" text NOT NULL,
    "timeZone" text DEFAULT 'Asia/Jakarta'::text NOT NULL,
    locale text DEFAULT 'id-ID'::text NOT NULL,
    currency text DEFAULT 'IDR'::text NOT NULL,
    "weekStartsOn" integer DEFAULT 1 NOT NULL,
    "themePreference" text DEFAULT 'system'::text NOT NULL,
    "onboardingCompleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lastSeenAt" timestamp(3) without time zone
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: Account Account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);


--
-- Name: Area Area_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Area"
    ADD CONSTRAINT "Area_pkey" PRIMARY KEY (id);


--
-- Name: Attachment Attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_pkey" PRIMARY KEY (id);


--
-- Name: Budget Budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: Goal Goal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goal"
    ADD CONSTRAINT "Goal_pkey" PRIMARY KEY (id);


--
-- Name: HabitLog HabitLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HabitLog"
    ADD CONSTRAINT "HabitLog_pkey" PRIMARY KEY (id);


--
-- Name: Habit Habit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Habit"
    ADD CONSTRAINT "Habit_pkey" PRIMARY KEY (id);


--
-- Name: Insight Insight_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Insight"
    ADD CONSTRAINT "Insight_pkey" PRIMARY KEY (id);


--
-- Name: JournalEntryGoal JournalEntryGoal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntryGoal"
    ADD CONSTRAINT "JournalEntryGoal_pkey" PRIMARY KEY ("journalEntryId", "goalId");


--
-- Name: JournalEntryProject JournalEntryProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntryProject"
    ADD CONSTRAINT "JournalEntryProject_pkey" PRIMARY KEY ("journalEntryId", "projectId");


--
-- Name: JournalEntry JournalEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntry"
    ADD CONSTRAINT "JournalEntry_pkey" PRIMARY KEY (id);


--
-- Name: JournalTag JournalTag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalTag"
    ADD CONSTRAINT "JournalTag_pkey" PRIMARY KEY ("journalEntryId", "tagId");


--
-- Name: LifeEvent LifeEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LifeEvent"
    ADD CONSTRAINT "LifeEvent_pkey" PRIMARY KEY (id);


--
-- Name: Milestone Milestone_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Milestone"
    ADD CONSTRAINT "Milestone_pkey" PRIMARY KEY (id);


--
-- Name: MonthlyPlanTarget MonthlyPlanTarget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlanTarget"
    ADD CONSTRAINT "MonthlyPlanTarget_pkey" PRIMARY KEY (id);


--
-- Name: MonthlyPlan MonthlyPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlan"
    ADD CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY (id);


--
-- Name: Project Project_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_pkey" PRIMARY KEY (id);


--
-- Name: RecurringRule RecurringRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecurringRule"
    ADD CONSTRAINT "RecurringRule_pkey" PRIMARY KEY (id);


--
-- Name: Review Review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_pkey" PRIMARY KEY (id);


--
-- Name: SavingsGoal SavingsGoal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavingsGoal"
    ADD CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: Tag Tag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tag"
    ADD CONSTRAINT "Tag_pkey" PRIMARY KEY (id);


--
-- Name: Task Task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_pkey" PRIMARY KEY (id);


--
-- Name: Transaction Transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Account_userId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Account_userId_archivedAt_idx" ON public."Account" USING btree ("userId", "archivedAt");


--
-- Name: Account_userId_closedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Account_userId_closedAt_idx" ON public."Account" USING btree ("userId", "closedAt");


--
-- Name: Account_userId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Account_userId_name_key" ON public."Account" USING btree ("userId", name);


--
-- Name: Area_userId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Area_userId_archivedAt_idx" ON public."Area" USING btree ("userId", "archivedAt");


--
-- Name: Area_userId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Area_userId_name_key" ON public."Area" USING btree ("userId", name);


--
-- Name: Attachment_journalEntryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Attachment_journalEntryId_idx" ON public."Attachment" USING btree ("journalEntryId");


--
-- Name: Attachment_lifeEventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Attachment_lifeEventId_idx" ON public."Attachment" USING btree ("lifeEventId");


--
-- Name: Attachment_transactionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Attachment_transactionId_idx" ON public."Attachment" USING btree ("transactionId");


--
-- Name: Attachment_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Attachment_userId_createdAt_idx" ON public."Attachment" USING btree ("userId", "createdAt");


--
-- Name: Budget_userId_periodStart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Budget_userId_periodStart_idx" ON public."Budget" USING btree ("userId", "periodStart");


--
-- Name: Budget_userId_periodStart_period_categoryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Budget_userId_periodStart_period_categoryId_key" ON public."Budget" USING btree ("userId", "periodStart", period, "categoryId");


--
-- Name: Category_userId_kind_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Category_userId_kind_archivedAt_idx" ON public."Category" USING btree ("userId", kind, "archivedAt");


--
-- Name: Category_userId_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Category_userId_parentId_idx" ON public."Category" USING btree ("userId", "parentId");


--
-- Name: Category_userId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Category_userId_slug_key" ON public."Category" USING btree ("userId", slug);


--
-- Name: Goal_targetDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Goal_targetDate_idx" ON public."Goal" USING btree ("targetDate");


--
-- Name: Goal_userId_areaId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Goal_userId_areaId_idx" ON public."Goal" USING btree ("userId", "areaId");


--
-- Name: Goal_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Goal_userId_status_idx" ON public."Goal" USING btree ("userId", status);


--
-- Name: HabitLog_habitId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "HabitLog_habitId_date_key" ON public."HabitLog" USING btree ("habitId", date);


--
-- Name: HabitLog_userId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "HabitLog_userId_date_idx" ON public."HabitLog" USING btree ("userId", date);


--
-- Name: Habit_userId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Habit_userId_archivedAt_idx" ON public."Habit" USING btree ("userId", "archivedAt");


--
-- Name: Habit_userId_areaId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Habit_userId_areaId_idx" ON public."Habit" USING btree ("userId", "areaId");


--
-- Name: Insight_userId_dismissedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Insight_userId_dismissedAt_idx" ON public."Insight" USING btree ("userId", "dismissedAt");


--
-- Name: Insight_userId_periodStart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Insight_userId_periodStart_idx" ON public."Insight" USING btree ("userId", "periodStart");


--
-- Name: JournalEntryGoal_goalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JournalEntryGoal_goalId_idx" ON public."JournalEntryGoal" USING btree ("goalId");


--
-- Name: JournalEntryProject_projectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JournalEntryProject_projectId_idx" ON public."JournalEntryProject" USING btree ("projectId");


--
-- Name: JournalEntry_userId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JournalEntry_userId_date_idx" ON public."JournalEntry" USING btree ("userId", date);


--
-- Name: JournalEntry_userId_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "JournalEntry_userId_date_key" ON public."JournalEntry" USING btree ("userId", date);


--
-- Name: JournalTag_tagId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JournalTag_tagId_idx" ON public."JournalTag" USING btree ("tagId");


--
-- Name: LifeEvent_userId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LifeEvent_userId_category_idx" ON public."LifeEvent" USING btree ("userId", category);


--
-- Name: LifeEvent_userId_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LifeEvent_userId_date_idx" ON public."LifeEvent" USING btree ("userId", date);


--
-- Name: Milestone_userId_projectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Milestone_userId_projectId_idx" ON public."Milestone" USING btree ("userId", "projectId");


--
-- Name: MonthlyPlanTarget_goalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MonthlyPlanTarget_goalId_idx" ON public."MonthlyPlanTarget" USING btree ("goalId");


--
-- Name: MonthlyPlanTarget_habitId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MonthlyPlanTarget_habitId_idx" ON public."MonthlyPlanTarget" USING btree ("habitId");


--
-- Name: MonthlyPlanTarget_monthlyPlanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MonthlyPlanTarget_monthlyPlanId_idx" ON public."MonthlyPlanTarget" USING btree ("monthlyPlanId");


--
-- Name: MonthlyPlanTarget_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MonthlyPlanTarget_userId_idx" ON public."MonthlyPlanTarget" USING btree ("userId");


--
-- Name: MonthlyPlan_userId_monthStart_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MonthlyPlan_userId_monthStart_key" ON public."MonthlyPlan" USING btree ("userId", "monthStart");


--
-- Name: Project_userId_goalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Project_userId_goalId_idx" ON public."Project" USING btree ("userId", "goalId");


--
-- Name: Project_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Project_userId_status_idx" ON public."Project" USING btree ("userId", status);


--
-- Name: RecurringRule_userId_archivedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecurringRule_userId_archivedAt_idx" ON public."RecurringRule" USING btree ("userId", "archivedAt");


--
-- Name: RecurringRule_userId_nextRunAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecurringRule_userId_nextRunAt_idx" ON public."RecurringRule" USING btree ("userId", "nextRunAt");


--
-- Name: Review_userId_kind_periodStart_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Review_userId_kind_periodStart_key" ON public."Review" USING btree ("userId", kind, "periodStart");


--
-- Name: Review_userId_periodStart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Review_userId_periodStart_idx" ON public."Review" USING btree ("userId", "periodStart");


--
-- Name: SavingsGoal_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SavingsGoal_userId_status_idx" ON public."SavingsGoal" USING btree ("userId", status);


--
-- Name: Session_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_expiresAt_idx" ON public."Session" USING btree ("expiresAt");


--
-- Name: Session_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Session_tokenHash_key" ON public."Session" USING btree ("tokenHash");


--
-- Name: Session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");


--
-- Name: Tag_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Tag_userId_idx" ON public."Tag" USING btree ("userId");


--
-- Name: Tag_userId_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Tag_userId_slug_key" ON public."Tag" USING btree ("userId", slug);


--
-- Name: Task_userId_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_userId_dueDate_idx" ON public."Task" USING btree ("userId", "dueDate");


--
-- Name: Task_userId_goalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_userId_goalId_idx" ON public."Task" USING btree ("userId", "goalId");


--
-- Name: Task_userId_projectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_userId_projectId_idx" ON public."Task" USING btree ("userId", "projectId");


--
-- Name: Task_userId_scheduledFor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_userId_scheduledFor_idx" ON public."Task" USING btree ("userId", "scheduledFor");


--
-- Name: Task_userId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_userId_status_idx" ON public."Task" USING btree ("userId", status);


--
-- Name: Transaction_accountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_accountId_idx" ON public."Transaction" USING btree ("accountId");


--
-- Name: Transaction_toAccountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_toAccountId_idx" ON public."Transaction" USING btree ("toAccountId");


--
-- Name: Transaction_userId_accountId_occurredOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_userId_accountId_occurredOn_idx" ON public."Transaction" USING btree ("userId", "accountId", "occurredOn");


--
-- Name: Transaction_userId_categoryId_occurredOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_userId_categoryId_occurredOn_idx" ON public."Transaction" USING btree ("userId", "categoryId", "occurredOn");


--
-- Name: Transaction_userId_occurredOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_userId_occurredOn_idx" ON public."Transaction" USING btree ("userId", "occurredOn");


--
-- Name: Transaction_userId_type_occurredOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Transaction_userId_type_occurredOn_idx" ON public."Transaction" USING btree ("userId", type, "occurredOn");


--
-- Name: User_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_createdAt_idx" ON public."User" USING btree ("createdAt");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: Account Account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Area Area_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Area"
    ADD CONSTRAINT "Area_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment Attachment_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public."JournalEntry"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment Attachment_lifeEventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_lifeEventId_fkey" FOREIGN KEY ("lifeEventId") REFERENCES public."LifeEvent"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment Attachment_transactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES public."Transaction"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Attachment Attachment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Attachment"
    ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Budget Budget_areaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES public."Area"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Budget Budget_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Budget Budget_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Budget"
    ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Category Category_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Category Category_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Goal Goal_areaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goal"
    ADD CONSTRAINT "Goal_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES public."Area"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Goal Goal_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goal"
    ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: HabitLog HabitLog_habitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HabitLog"
    ADD CONSTRAINT "HabitLog_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES public."Habit"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: HabitLog HabitLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HabitLog"
    ADD CONSTRAINT "HabitLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Habit Habit_areaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Habit"
    ADD CONSTRAINT "Habit_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES public."Area"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Habit Habit_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Habit"
    ADD CONSTRAINT "Habit_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Habit Habit_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Habit"
    ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Insight Insight_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Insight"
    ADD CONSTRAINT "Insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JournalEntryGoal JournalEntryGoal_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntryGoal"
    ADD CONSTRAINT "JournalEntryGoal_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goal"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JournalEntryGoal JournalEntryGoal_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntryGoal"
    ADD CONSTRAINT "JournalEntryGoal_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public."JournalEntry"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JournalEntryProject JournalEntryProject_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntryProject"
    ADD CONSTRAINT "JournalEntryProject_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public."JournalEntry"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JournalEntryProject JournalEntryProject_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntryProject"
    ADD CONSTRAINT "JournalEntryProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JournalEntry JournalEntry_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalEntry"
    ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JournalTag JournalTag_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalTag"
    ADD CONSTRAINT "JournalTag_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public."JournalEntry"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JournalTag JournalTag_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JournalTag"
    ADD CONSTRAINT "JournalTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tag"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LifeEvent LifeEvent_areaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LifeEvent"
    ADD CONSTRAINT "LifeEvent_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES public."Area"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LifeEvent LifeEvent_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LifeEvent"
    ADD CONSTRAINT "LifeEvent_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LifeEvent LifeEvent_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LifeEvent"
    ADD CONSTRAINT "LifeEvent_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public."JournalEntry"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LifeEvent LifeEvent_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LifeEvent"
    ADD CONSTRAINT "LifeEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: LifeEvent LifeEvent_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LifeEvent"
    ADD CONSTRAINT "LifeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Milestone Milestone_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Milestone"
    ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Milestone Milestone_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Milestone"
    ADD CONSTRAINT "Milestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MonthlyPlanTarget MonthlyPlanTarget_areaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlanTarget"
    ADD CONSTRAINT "MonthlyPlanTarget_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES public."Area"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MonthlyPlanTarget MonthlyPlanTarget_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlanTarget"
    ADD CONSTRAINT "MonthlyPlanTarget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MonthlyPlanTarget MonthlyPlanTarget_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlanTarget"
    ADD CONSTRAINT "MonthlyPlanTarget_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MonthlyPlanTarget MonthlyPlanTarget_habitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlanTarget"
    ADD CONSTRAINT "MonthlyPlanTarget_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES public."Habit"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MonthlyPlanTarget MonthlyPlanTarget_monthlyPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlanTarget"
    ADD CONSTRAINT "MonthlyPlanTarget_monthlyPlanId_fkey" FOREIGN KEY ("monthlyPlanId") REFERENCES public."MonthlyPlan"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MonthlyPlan MonthlyPlan_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MonthlyPlan"
    ADD CONSTRAINT "MonthlyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Project Project_areaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES public."Area"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Project Project_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Project Project_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Project"
    ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RecurringRule RecurringRule_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecurringRule"
    ADD CONSTRAINT "RecurringRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RecurringRule RecurringRule_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecurringRule"
    ADD CONSTRAINT "RecurringRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RecurringRule RecurringRule_toAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecurringRule"
    ADD CONSTRAINT "RecurringRule_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RecurringRule RecurringRule_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecurringRule"
    ADD CONSTRAINT "RecurringRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Review Review_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SavingsGoal SavingsGoal_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavingsGoal"
    ADD CONSTRAINT "SavingsGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SavingsGoal SavingsGoal_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavingsGoal"
    ADD CONSTRAINT "SavingsGoal_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SavingsGoal SavingsGoal_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavingsGoal"
    ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Task Task_areaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES public."Area"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Task Task_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goal"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Task Task_milestoneId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES public."Milestone"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Task Task_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public."Project"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Task Task_recurrenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES public."RecurringRule"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Task Task_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Transaction Transaction_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Transaction Transaction_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Transaction Transaction_recurringRuleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES public."RecurringRule"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Transaction Transaction_toAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Transaction Transaction_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Transaction"
    ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict iRx7497IAVHMUBVuZtoSCXvkf8X4IPeNxesU3CceaeTjysx0DzgWTGy8V84PTgU

