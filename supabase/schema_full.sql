--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public;  （ステージングには既に存在するため無効化）


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

-- COMMENT ON SCHEMA public IS 'standard public schema';  （所有者でないと失敗するため無効化）


--
-- Name: has_company_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_company_access(cid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.is_staff()
      or exists (
        select 1 from public.company_members m
        where m.company_id = cid and m.user_id = auth.uid()
      );
$$;


--
-- Name: is_finance_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_finance_member() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.finance_members m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select coalesce(auth.jwt() ->> 'email', '') like '%@accel-partners.co.jp';
$$;


--
-- Name: send_email_hook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_email_hook() RETURNS jsonb
    LANGUAGE plpgsql
    AS $$BEGIN
  RETURN jsonb_build_object(
    'messages', jsonb_build_array(
      jsonb_build_object(
        'to', 'example@example.com',
        'subject', 'Test',
        'html', '<p>Test</p>'
      )
    )
  );
END;$$;


--
-- Name: set_practice_points_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_practice_points_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_access (
    app_id uuid NOT NULL,
    user_id uuid NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: apps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text,
    description text,
    image_url text,
    category text,
    status text DEFAULT '''active'''::text,
    "order" bigint DEFAULT '0'::bigint,
    owner text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: article_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    color text DEFAULT '#2563eb'::text,
    created_at timestamp with time zone DEFAULT now(),
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    role text,
    CONSTRAINT article_categories_role_check CHECK (((role IS NULL) OR (role = ANY (ARRAY['member'::text, 'guide'::text]))))
);


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category_id uuid,
    author_slack_user_id text NOT NULL,
    author_name text NOT NULL,
    author_avatar text,
    cover_image_url text,
    published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: assessment_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_criteria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    weight numeric(5,2) DEFAULT 1 NOT NULL,
    score numeric(5,2),
    rationale text,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    status text DEFAULT 'complete'::text NOT NULL,
    overall_score numeric(5,2),
    summary text,
    model text,
    input_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    criteria_set_id uuid
);


--
-- Name: channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slack_channel_id text,
    is_hidden boolean DEFAULT false
);


--
-- Name: checklist_findings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    detail text,
    fix text,
    category text,
    priority text DEFAULT 'medium'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: checklist_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    company_id uuid NOT NULL,
    item_key text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    evidence text,
    fix text,
    manual boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    CONSTRAINT checklist_results_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: checklist_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    summary text,
    ok_count integer DEFAULT 0 NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    score numeric(5,2),
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    product text DEFAULT 'magnet'::text NOT NULL,
    CONSTRAINT checklist_runs_product_check CHECK ((product = ANY (ARRAY['magnet'::text, 'compass'::text])))
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    website text,
    industry text,
    notes text,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    product text DEFAULT 'magnet'::text NOT NULL,
    CONSTRAINT companies_product_check CHECK ((product = ANY (ARRAY['magnet'::text, 'compass'::text])))
);


--
-- Name: company_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_members (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email text,
    role text DEFAULT 'viewer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: competitor_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competitor_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    competitor_name text NOT NULL,
    criteria_name text NOT NULL,
    score numeric(5,2),
    rationale text
);


--
-- Name: competitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    website text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_ideas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    format text,
    target_question text,
    audience text,
    outline text,
    priority text DEFAULT 'medium'::text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: criteria_set_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.criteria_set_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    criteria_set_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    weight numeric(5,2) DEFAULT 10 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: criteria_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.criteria_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    rationale text,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: crm_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_docs (
    collection text NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.crm_docs REPLICA IDENTITY FULL;


--
-- Name: custom_emojis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_emojis (
    name text NOT NULL,
    url text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: dashboard_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_state (
    id text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);


--
-- Name: doc_divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doc_divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: doc_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doc_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    url text NOT NULL,
    kind text DEFAULT 'link'::text NOT NULL,
    division_id uuid,
    purpose_id uuid,
    pinned boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: doc_purposes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doc_purposes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    date timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    end_time timestamp with time zone
);


--
-- Name: event_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    event_date_id uuid,
    responder_name text NOT NULL,
    response text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    avatar_url text,
    CONSTRAINT event_responses_response_check CHECK ((response = ANY (ARRAY['○'::text, '△'::text, '×'::text])))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    created_by text NOT NULL,
    deadline timestamp with time zone,
    confirmed_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    cover_image_url text,
    category text,
    created_by_avatar text,
    CONSTRAINT events_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['勉強会'::text, '食事会'::text, 'レジャー'::text, 'その他'::text]))))
);


--
-- Name: finance_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_docs (
    collection text NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.finance_docs REPLICA IDENTITY FULL;


--
-- Name: finance_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_members (
    email text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: idea_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idea_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idea_id uuid,
    author_slack_user_id text NOT NULL,
    author_name text NOT NULL,
    author_avatar text,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: idea_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idea_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idea_id uuid,
    user_slack_id text NOT NULL,
    user_name text NOT NULL,
    reaction text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ideas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_slack_user_id text NOT NULL,
    author_name text NOT NULL,
    author_avatar text,
    content text NOT NULL,
    category text DEFAULT 'ネタ'::text,
    images jsonb,
    ai_column text,
    ai_script text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: member_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slack_user_id text NOT NULL,
    prefecture text,
    organization text,
    headline text,
    sub_headline text,
    expertise text,
    achievements text,
    bio text,
    availability text,
    appeal text,
    updated_at timestamp with time zone DEFAULT now(),
    x_url text,
    note_url text,
    instagram_url text,
    website_url text,
    avatar_url text
);


--
-- Name: mention_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mention_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    question text NOT NULL,
    intent text,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    question text NOT NULL,
    answer text,
    mentioned boolean,
    sentiment text,
    rank_position integer,
    notes text,
    sources jsonb,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    question_id uuid,
    batch_id uuid
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid,
    message_created_at timestamp with time zone NOT NULL,
    user_name text NOT NULL,
    reaction text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.message_reactions REPLICA IDENTITY FULL;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    user_name text DEFAULT 'ゲスト'::text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    thread_ts timestamp with time zone,
    files_json jsonb,
    avatar_url text,
    slack_user_id text
);


--
-- Name: photo_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photo_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    cover_image_url text,
    is_member_upload boolean DEFAULT true,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    uploader_name text NOT NULL,
    uploader_avatar text,
    image_url text NOT NULL,
    caption text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: practice_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slack_user_id text NOT NULL,
    activity text NOT NULL,
    worked_on date NOT NULL,
    worked_note text,
    points smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT practice_points_activity_len CHECK (((char_length(activity) >= 1) AND (char_length(activity) <= 500))),
    CONSTRAINT practice_points_note_len CHECK (((worked_note IS NULL) OR (char_length(worked_note) <= 200))),
    CONSTRAINT practice_points_points_range CHECK (((points >= 1) AND (points <= 30)))
);


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    assessment_id uuid,
    title text NOT NULL,
    detail text,
    priority text DEFAULT 'medium'::text NOT NULL,
    effort text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.todos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    recommendation_id uuid,
    title text NOT NULL,
    detail text,
    source text DEFAULT 'manual'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    due_on date,
    done boolean DEFAULT false NOT NULL,
    done_at timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slack_user_id text NOT NULL,
    notify_new_message boolean DEFAULT true,
    notify_mention boolean DEFAULT true,
    notify_reaction boolean DEFAULT false,
    notify_event boolean DEFAULT true,
    notify_new_member boolean DEFAULT false,
    sound_enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    renewal_deadline date
);


--
-- Name: COLUMN user_settings.renewal_deadline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_settings.renewal_deadline IS '中小企業診断士の登録更新期限。この日までに実務従事30ポイントを目標とする';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slack_user_id text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    slack_token text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: app_access app_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_access
    ADD CONSTRAINT app_access_pkey PRIMARY KEY (app_id, user_id);


--
-- Name: apps apps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apps
    ADD CONSTRAINT apps_pkey PRIMARY KEY (id);


--
-- Name: article_categories article_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories
    ADD CONSTRAINT article_categories_pkey PRIMARY KEY (id);


--
-- Name: articles articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);


--
-- Name: assessment_criteria assessment_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_criteria
    ADD CONSTRAINT assessment_criteria_pkey PRIMARY KEY (id);


--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);


--
-- Name: channels channels_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_name_key UNIQUE (name);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: channels channels_slack_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_slack_channel_id_key UNIQUE (slack_channel_id);


--
-- Name: checklist_findings checklist_findings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_findings
    ADD CONSTRAINT checklist_findings_pkey PRIMARY KEY (id);


--
-- Name: checklist_results checklist_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_results
    ADD CONSTRAINT checklist_results_pkey PRIMARY KEY (id);


--
-- Name: checklist_runs checklist_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_runs
    ADD CONSTRAINT checklist_runs_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_members company_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_pkey PRIMARY KEY (company_id, user_id);


--
-- Name: competitor_scores competitor_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitor_scores
    ADD CONSTRAINT competitor_scores_pkey PRIMARY KEY (id);


--
-- Name: competitors competitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitors
    ADD CONSTRAINT competitors_pkey PRIMARY KEY (id);


--
-- Name: content_ideas content_ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_ideas
    ADD CONSTRAINT content_ideas_pkey PRIMARY KEY (id);


--
-- Name: criteria_set_items criteria_set_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criteria_set_items
    ADD CONSTRAINT criteria_set_items_pkey PRIMARY KEY (id);


--
-- Name: criteria_sets criteria_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criteria_sets
    ADD CONSTRAINT criteria_sets_pkey PRIMARY KEY (id);


--
-- Name: crm_docs crm_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_docs
    ADD CONSTRAINT crm_docs_pkey PRIMARY KEY (collection, id);


--
-- Name: custom_emojis custom_emojis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_emojis
    ADD CONSTRAINT custom_emojis_pkey PRIMARY KEY (name);


--
-- Name: dashboard_state dashboard_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_state
    ADD CONSTRAINT dashboard_state_pkey PRIMARY KEY (id);


--
-- Name: doc_divisions doc_divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_divisions
    ADD CONSTRAINT doc_divisions_pkey PRIMARY KEY (id);


--
-- Name: doc_links doc_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_links
    ADD CONSTRAINT doc_links_pkey PRIMARY KEY (id);


--
-- Name: doc_purposes doc_purposes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_purposes
    ADD CONSTRAINT doc_purposes_pkey PRIMARY KEY (id);


--
-- Name: event_dates event_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_dates
    ADD CONSTRAINT event_dates_pkey PRIMARY KEY (id);


--
-- Name: event_responses event_responses_event_date_id_responder_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_responses
    ADD CONSTRAINT event_responses_event_date_id_responder_name_key UNIQUE (event_date_id, responder_name);


--
-- Name: event_responses event_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_responses
    ADD CONSTRAINT event_responses_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: finance_docs finance_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_docs
    ADD CONSTRAINT finance_docs_pkey PRIMARY KEY (collection, id);


--
-- Name: finance_members finance_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_members
    ADD CONSTRAINT finance_members_pkey PRIMARY KEY (email);


--
-- Name: idea_comments idea_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_comments
    ADD CONSTRAINT idea_comments_pkey PRIMARY KEY (id);


--
-- Name: idea_reactions idea_reactions_idea_id_user_slack_id_reaction_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_reactions
    ADD CONSTRAINT idea_reactions_idea_id_user_slack_id_reaction_key UNIQUE (idea_id, user_slack_id, reaction);


--
-- Name: idea_reactions idea_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_reactions
    ADD CONSTRAINT idea_reactions_pkey PRIMARY KEY (id);


--
-- Name: ideas ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ideas
    ADD CONSTRAINT ideas_pkey PRIMARY KEY (id);


--
-- Name: member_profiles member_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_profiles
    ADD CONSTRAINT member_profiles_pkey PRIMARY KEY (id);


--
-- Name: member_profiles member_profiles_slack_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_profiles
    ADD CONSTRAINT member_profiles_slack_user_id_key UNIQUE (slack_user_id);


--
-- Name: mention_questions mention_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mention_questions
    ADD CONSTRAINT mention_questions_pkey PRIMARY KEY (id);


--
-- Name: mentions mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_channel_id_message_created_at_user_name_r_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_channel_id_message_created_at_user_name_r_key UNIQUE (channel_id, message_created_at, user_name, reaction);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: photo_categories photo_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_categories
    ADD CONSTRAINT photo_categories_pkey PRIMARY KEY (id);


--
-- Name: photos photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_pkey PRIMARY KEY (id);


--
-- Name: practice_points practice_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_points
    ADD CONSTRAINT practice_points_pkey PRIMARY KEY (id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);


--
-- Name: todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_slack_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_slack_user_id_key UNIQUE (slack_user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_slack_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_slack_user_id_key UNIQUE (slack_user_id);


--
-- Name: assessment_criteria_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_criteria_idx ON public.assessment_criteria USING btree (assessment_id, sort_order);


--
-- Name: assessments_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessments_company_idx ON public.assessments USING btree (company_id, created_at DESC);


--
-- Name: checklist_findings_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checklist_findings_company_idx ON public.checklist_findings USING btree (company_id, created_at DESC);


--
-- Name: checklist_findings_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checklist_findings_run_idx ON public.checklist_findings USING btree (run_id);


--
-- Name: checklist_results_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checklist_results_company_idx ON public.checklist_results USING btree (company_id, item_key);


--
-- Name: checklist_results_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checklist_results_run_idx ON public.checklist_results USING btree (run_id);


--
-- Name: checklist_runs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checklist_runs_company_idx ON public.checklist_runs USING btree (company_id, created_at DESC);


--
-- Name: checklist_runs_company_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checklist_runs_company_product_idx ON public.checklist_runs USING btree (company_id, product, created_at DESC);


--
-- Name: companies_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_product_idx ON public.companies USING btree (product) WHERE (archived = false);


--
-- Name: company_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_members_user_idx ON public.company_members USING btree (user_id);


--
-- Name: competitor_scores_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX competitor_scores_idx ON public.competitor_scores USING btree (assessment_id);


--
-- Name: competitors_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX competitors_company_idx ON public.competitors USING btree (company_id);


--
-- Name: content_ideas_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_ideas_company_idx ON public.content_ideas USING btree (company_id, used, created_at DESC);


--
-- Name: criteria_set_items_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX criteria_set_items_idx ON public.criteria_set_items USING btree (criteria_set_id, sort_order);


--
-- Name: criteria_sets_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX criteria_sets_company_idx ON public.criteria_sets USING btree (company_id, active);


--
-- Name: idx_app_access_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_access_user ON public.app_access USING btree (user_id);


--
-- Name: idx_article_categories_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_categories_parent_id ON public.article_categories USING btree (parent_id);


--
-- Name: idx_article_categories_role_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_article_categories_role_unique ON public.article_categories USING btree (role) WHERE (role IS NOT NULL);


--
-- Name: idx_article_categories_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_categories_sort ON public.article_categories USING btree (parent_id, sort_order);


--
-- Name: idx_crm_docs_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_docs_collection ON public.crm_docs USING btree (collection);


--
-- Name: idx_doc_links_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_links_division ON public.doc_links USING btree (division_id);


--
-- Name: idx_doc_links_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_links_purpose ON public.doc_links USING btree (purpose_id);


--
-- Name: idx_events_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_category ON public.events USING btree (category);


--
-- Name: idx_events_confirmed_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_confirmed_date ON public.events USING btree (confirmed_date);


--
-- Name: idx_finance_docs_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_docs_collection ON public.finance_docs USING btree (collection);


--
-- Name: idx_messages_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_messages_channel_created ON public.messages USING btree (channel_id, created_at);


--
-- Name: idx_messages_channel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_channel_id ON public.messages USING btree (channel_id);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);


--
-- Name: idx_messages_slack_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_slack_user_id ON public.messages USING btree (slack_user_id);


--
-- Name: idx_messages_thread_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_thread_ts ON public.messages USING btree (thread_ts) WHERE (thread_ts IS NOT NULL);


--
-- Name: idx_practice_points_user_worked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_points_user_worked ON public.practice_points USING btree (slack_user_id, worked_on DESC);


--
-- Name: idx_practice_points_user_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_points_user_year ON public.practice_points USING btree (slack_user_id, EXTRACT(year FROM worked_on));


--
-- Name: mention_questions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mention_questions_company_idx ON public.mention_questions USING btree (company_id, active, sort_order);


--
-- Name: mentions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mentions_company_idx ON public.mentions USING btree (company_id, created_at DESC);


--
-- Name: recommendations_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recommendations_company_idx ON public.recommendations USING btree (company_id, created_at DESC);


--
-- Name: todos_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX todos_company_idx ON public.todos USING btree (company_id, done, sort_order);


--
-- Name: companies companies_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_touch BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: doc_links trg_doc_links_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_doc_links_touch BEFORE UPDATE ON public.doc_links FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: practice_points trg_practice_points_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_practice_points_updated_at BEFORE UPDATE ON public.practice_points FOR EACH ROW EXECUTE FUNCTION public.set_practice_points_updated_at();


--
-- Name: app_access app_access_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_access
    ADD CONSTRAINT app_access_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE;


--
-- Name: app_access app_access_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_access
    ADD CONSTRAINT app_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: app_access app_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_access
    ADD CONSTRAINT app_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: article_categories article_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_categories
    ADD CONSTRAINT article_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.article_categories(id) ON DELETE SET NULL;


--
-- Name: articles articles_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.article_categories(id) ON DELETE SET NULL;


--
-- Name: assessment_criteria assessment_criteria_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_criteria
    ADD CONSTRAINT assessment_criteria_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: assessments assessments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: assessments assessments_criteria_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_criteria_set_id_fkey FOREIGN KEY (criteria_set_id) REFERENCES public.criteria_sets(id) ON DELETE SET NULL;


--
-- Name: checklist_findings checklist_findings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_findings
    ADD CONSTRAINT checklist_findings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: checklist_findings checklist_findings_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_findings
    ADD CONSTRAINT checklist_findings_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.checklist_runs(id) ON DELETE CASCADE;


--
-- Name: checklist_results checklist_results_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_results
    ADD CONSTRAINT checklist_results_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: checklist_results checklist_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_results
    ADD CONSTRAINT checklist_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.checklist_runs(id) ON DELETE CASCADE;


--
-- Name: checklist_runs checklist_runs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_runs
    ADD CONSTRAINT checklist_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: checklist_runs checklist_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_runs
    ADD CONSTRAINT checklist_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: company_members company_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_members company_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: competitor_scores competitor_scores_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitor_scores
    ADD CONSTRAINT competitor_scores_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;


--
-- Name: competitors competitors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitors
    ADD CONSTRAINT competitors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: content_ideas content_ideas_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_ideas
    ADD CONSTRAINT content_ideas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: content_ideas content_ideas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_ideas
    ADD CONSTRAINT content_ideas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: criteria_set_items criteria_set_items_criteria_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criteria_set_items
    ADD CONSTRAINT criteria_set_items_criteria_set_id_fkey FOREIGN KEY (criteria_set_id) REFERENCES public.criteria_sets(id) ON DELETE CASCADE;


--
-- Name: criteria_sets criteria_sets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criteria_sets
    ADD CONSTRAINT criteria_sets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: criteria_sets criteria_sets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.criteria_sets
    ADD CONSTRAINT criteria_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: crm_docs crm_docs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_docs
    ADD CONSTRAINT crm_docs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: doc_links doc_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_links
    ADD CONSTRAINT doc_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: doc_links doc_links_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_links
    ADD CONSTRAINT doc_links_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.doc_divisions(id) ON DELETE SET NULL;


--
-- Name: doc_links doc_links_purpose_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doc_links
    ADD CONSTRAINT doc_links_purpose_id_fkey FOREIGN KEY (purpose_id) REFERENCES public.doc_purposes(id) ON DELETE SET NULL;


--
-- Name: event_dates event_dates_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_dates
    ADD CONSTRAINT event_dates_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_responses event_responses_event_date_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_responses
    ADD CONSTRAINT event_responses_event_date_id_fkey FOREIGN KEY (event_date_id) REFERENCES public.event_dates(id) ON DELETE CASCADE;


--
-- Name: event_responses event_responses_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_responses
    ADD CONSTRAINT event_responses_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: finance_docs finance_docs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_docs
    ADD CONSTRAINT finance_docs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: idea_comments idea_comments_idea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_comments
    ADD CONSTRAINT idea_comments_idea_id_fkey FOREIGN KEY (idea_id) REFERENCES public.ideas(id) ON DELETE CASCADE;


--
-- Name: idea_reactions idea_reactions_idea_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idea_reactions
    ADD CONSTRAINT idea_reactions_idea_id_fkey FOREIGN KEY (idea_id) REFERENCES public.ideas(id) ON DELETE CASCADE;


--
-- Name: mention_questions mention_questions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mention_questions
    ADD CONSTRAINT mention_questions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: mentions mentions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: mentions mentions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentions
    ADD CONSTRAINT mentions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.mention_questions(id) ON DELETE SET NULL;


--
-- Name: message_reactions message_reactions_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: messages messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: photos photos_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photos
    ADD CONSTRAINT photos_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.photo_categories(id) ON DELETE CASCADE;


--
-- Name: recommendations recommendations_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE SET NULL;


--
-- Name: recommendations recommendations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: todos todos_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: todos todos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: todos todos_recommendation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id) ON DELETE SET NULL;


--
-- Name: idea_comments all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "all" ON public.idea_comments USING (true) WITH CHECK (true);


--
-- Name: idea_reactions all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "all" ON public.idea_reactions USING (true) WITH CHECK (true);


--
-- Name: ideas all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "all" ON public.ideas USING (true) WITH CHECK (true);


--
-- Name: users allow_domain_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_domain_users ON public.users USING (((auth.jwt() ->> 'email'::text) ~~ '%@accel-partners.co.jp'::text));


--
-- Name: app_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_access ENABLE ROW LEVEL SECURITY;

--
-- Name: app_access app_access_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_access_select ON public.app_access FOR SELECT TO authenticated USING ((public.is_staff() OR (user_id = auth.uid())));


--
-- Name: app_access app_access_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_access_write ON public.app_access TO service_role USING (true) WITH CHECK (true);


--
-- Name: apps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;

--
-- Name: apps apps_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apps_select ON public.apps FOR SELECT TO authenticated USING ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.app_access a
  WHERE ((a.app_id = apps.id) AND (a.user_id = auth.uid()))))));


--
-- Name: article_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.article_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

--
-- Name: assessment_criteria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessment_criteria ENABLE ROW LEVEL SECURITY;

--
-- Name: assessment_criteria assessment_criteria_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_criteria_select ON public.assessment_criteria FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.assessments a
  WHERE ((a.id = assessment_criteria.assessment_id) AND public.has_company_access(a.company_id)))));


--
-- Name: assessment_criteria assessment_criteria_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessment_criteria_write ON public.assessment_criteria TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: assessments assessments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: assessments assessments_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assessments_write ON public.assessments TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: dashboard_state authenticated can insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can insert" ON public.dashboard_state FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: dashboard_state authenticated can read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can read" ON public.dashboard_state FOR SELECT TO authenticated USING (true);


--
-- Name: dashboard_state authenticated can update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated can update" ON public.dashboard_state FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: channels channels_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_select_all ON public.channels FOR SELECT TO authenticated, anon USING (true);


--
-- Name: checklist_findings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist_findings ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_findings checklist_findings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY checklist_findings_select ON public.checklist_findings FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: checklist_findings checklist_findings_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY checklist_findings_write ON public.checklist_findings TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: checklist_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist_results ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_results checklist_results_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY checklist_results_select ON public.checklist_results FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: checklist_results checklist_results_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY checklist_results_write ON public.checklist_results TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: checklist_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_runs checklist_runs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY checklist_runs_select ON public.checklist_runs FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: checklist_runs checklist_runs_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY checklist_runs_write ON public.checklist_runs TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated USING (public.has_company_access(id));


--
-- Name: companies companies_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_write ON public.companies TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: company_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

--
-- Name: company_members company_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_members_select ON public.company_members FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: company_members company_members_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_members_write ON public.company_members TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: competitor_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competitor_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: competitor_scores competitor_scores_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competitor_scores_select ON public.competitor_scores FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.assessments a
  WHERE ((a.id = competitor_scores.assessment_id) AND public.has_company_access(a.company_id)))));


--
-- Name: competitor_scores competitor_scores_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competitor_scores_write ON public.competitor_scores TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: competitors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

--
-- Name: competitors competitors_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competitors_select ON public.competitors FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: competitors competitors_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY competitors_write ON public.competitors TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: content_ideas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;

--
-- Name: content_ideas content_ideas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY content_ideas_select ON public.content_ideas FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: content_ideas content_ideas_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY content_ideas_write ON public.content_ideas TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: criteria_set_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.criteria_set_items ENABLE ROW LEVEL SECURITY;

--
-- Name: criteria_set_items criteria_set_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY criteria_set_items_select ON public.criteria_set_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.criteria_sets s
  WHERE ((s.id = criteria_set_items.criteria_set_id) AND public.has_company_access(s.company_id)))));


--
-- Name: criteria_set_items criteria_set_items_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY criteria_set_items_write ON public.criteria_set_items TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: criteria_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.criteria_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: criteria_sets criteria_sets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY criteria_sets_select ON public.criteria_sets FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: criteria_sets criteria_sets_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY criteria_sets_write ON public.criteria_sets TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: crm_docs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_docs ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_docs crm_docs_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_docs_staff ON public.crm_docs TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: custom_emojis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_emojis ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_state ENABLE ROW LEVEL SECURITY;

--
-- Name: doc_divisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doc_divisions ENABLE ROW LEVEL SECURITY;

--
-- Name: doc_divisions doc_divisions_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doc_divisions_staff ON public.doc_divisions TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: doc_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doc_links ENABLE ROW LEVEL SECURITY;

--
-- Name: doc_links doc_links_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doc_links_staff ON public.doc_links TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: doc_purposes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doc_purposes ENABLE ROW LEVEL SECURITY;

--
-- Name: doc_purposes doc_purposes_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY doc_purposes_staff ON public.doc_purposes TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: event_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: event_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_docs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_docs ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_docs finance_docs_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_docs_members ON public.finance_docs TO authenticated USING (public.is_finance_member()) WITH CHECK (public.is_finance_member());


--
-- Name: finance_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_members ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_members finance_members_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_members_self ON public.finance_members FOR SELECT TO authenticated USING (public.is_finance_member());


--
-- Name: idea_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idea_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: idea_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idea_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: ideas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

--
-- Name: photo_categories insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_all ON public.photo_categories USING (true);


--
-- Name: photos insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_all ON public.photos USING (true);


--
-- Name: member_profiles insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_own ON public.member_profiles FOR INSERT WITH CHECK (true);


--
-- Name: member_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: mention_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mention_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: mention_questions mention_questions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mention_questions_select ON public.mention_questions FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: mention_questions mention_questions_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mention_questions_write ON public.mention_questions TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: mentions mentions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mentions_select ON public.mentions FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: mentions mentions_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mentions_write ON public.mentions TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_insert_all ON public.messages FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: messages messages_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select_all ON public.messages FOR SELECT TO authenticated, anon USING (true);


--
-- Name: photo_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.photo_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

--
-- Name: practice_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practice_points ENABLE ROW LEVEL SECURITY;

--
-- Name: practice_points practice_points_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_points_delete_service ON public.practice_points FOR DELETE TO service_role USING (true);


--
-- Name: practice_points practice_points_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_points_insert_service ON public.practice_points FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: practice_points practice_points_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_points_select_all ON public.practice_points FOR SELECT TO authenticated, anon USING (true);


--
-- Name: practice_points practice_points_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_points_update_service ON public.practice_points FOR UPDATE TO service_role USING (true);


--
-- Name: article_categories read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.article_categories FOR SELECT USING (true);


--
-- Name: articles read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.articles FOR SELECT USING (true);


--
-- Name: event_dates read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.event_dates FOR SELECT USING (true);


--
-- Name: event_responses read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.event_responses FOR SELECT USING (true);


--
-- Name: events read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.events FOR SELECT USING (true);


--
-- Name: member_profiles read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.member_profiles FOR SELECT USING (true);


--
-- Name: photo_categories read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.photo_categories FOR SELECT USING (true);


--
-- Name: photos read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_all ON public.photos FOR SELECT USING (true);


--
-- Name: custom_emojis read_custom_emojis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_custom_emojis ON public.custom_emojis FOR SELECT USING (true);


--
-- Name: user_settings read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_own ON public.user_settings FOR SELECT USING (true);


--
-- Name: recommendations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: recommendations recommendations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recommendations_select ON public.recommendations FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: recommendations recommendations_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recommendations_write ON public.recommendations TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: todos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

--
-- Name: todos todos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY todos_select ON public.todos FOR SELECT TO authenticated USING (public.has_company_access(company_id));


--
-- Name: todos todos_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY todos_write ON public.todos TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: member_profiles update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_own ON public.member_profiles FOR UPDATE USING (true);


--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_all ON public.users FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: users users_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_all ON public.users FOR SELECT TO authenticated, anon USING (true);


--
-- Name: users users_update_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_all ON public.users FOR UPDATE TO authenticated, anon USING (true);


--
-- Name: article_categories write_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_all ON public.article_categories USING (true);


--
-- Name: articles write_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_all ON public.articles USING (true);


--
-- Name: event_dates write_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_all ON public.event_dates USING (true);


--
-- Name: event_responses write_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_all ON public.event_responses USING (true);


--
-- Name: events write_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_all ON public.events USING (true);


--
-- Name: custom_emojis write_custom_emojis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_custom_emojis ON public.custom_emojis USING ((auth.role() = 'service_role'::text));


--
-- Name: user_settings write_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_own ON public.user_settings USING (true);


--
-- PostgreSQL database dump complete
--



--
-- 権限付与（本番と同じ、anon/authenticated に全面許可）
-- pg_dump に --no-privileges を付けているため、ここで明示的に付け直す。
--
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
