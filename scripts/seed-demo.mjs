/**
 * Seed script: inserts ~60 synthetic demo reflections, evidence, quotes,
 * and a demo grant into an existing organization for hackathon demo purposes.
 *
 * Usage:
 *   node scripts/seed-demo.mjs [email]
 *
 * Environment (from .env.local or shell):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const EMAIL = process.argv[2] || "andrewning2026@gmail.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function uuid() {
  return crypto.randomUUID();
}

function dateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// ------------------------------------------------------------------
// Demo data factories
// ------------------------------------------------------------------

const HOST_SITES = [
  { name: "Willowbrook Senior Living", address: "42 Maple Ave" },
  { name: "Maple Grove Care Center", address: "88 Oak Blvd" },
  { name: "Sunrise Memory Care", address: "101 Sunrise Dr" },
];

const CATEGORIES = [
  { name: "Violin Recital" },
  { name: "Group Sing-along" },
  { name: "Interactive Music" },
  { name: "Solo Piano" },
];

const FORMATS = ["solo", "small group", "sing-along", "interactive"];

const SESSION_DEFS = [
  { daysAgo: 85, site: 0, cat: 0, title: "Autumn Violin Recital" },
  { daysAgo: 78, site: 1, cat: 1, title: "Morning Sing-along" },
  { daysAgo: 64, site: 0, cat: 2, title: "Interactive Rhythm Circle" },
  { daysAgo: 57, site: 2, cat: 3, title: "Solo Piano Afternoon" },
  { daysAgo: 50, site: 1, cat: 0, title: "Chamber Music Hour" },
  { daysAgo: 36, site: 0, cat: 1, title: "Holiday Sing-along" },
  { daysAgo: 29, site: 2, cat: 2, title: "Drum Circle Workshop" },
  { daysAgo: 15, site: 1, cat: 3, title: "Piano & Poetry" },
];

const VOLUNTEER_NAMES = [
  "Sarah Chen", "James O'Brien", "Maria Lopez", "David Kim",
  "Emily Wang", "Robert Taylor", "Aisha Patel", "Michael Nguyen",
];

const REFLECTION_TEXTS = [
  "Residents were very engaged today. Several clapped along and one resident hummed the melody for several minutes after the piece ended.",
  "A quiet session, but deeply meaningful. One resident held my hand afterward and smiled without saying a word.",
  "Staff mentioned that this was the most alert they had seen Mrs. Henderson all week. She tapped her foot for the entire set.",
  "Group sing-along was energetic. We ran out of lyric sheets because so many people joined at the last minute.",
  "Family members stayed for the performance. One daughter told me she had not seen her mother sing in years.",
  "Rainy day so attendance was lower, but those who came were fully present. We repeated a favorite song twice by request.",
  "Memory care unit responded well to familiar tunes. Several non-verbal residents vocalized during the chorus.",
  "Interactive session with egg shakers. Even residents who usually stay in their chairs stood up and moved with the music.",
  "A resident who rarely participates asked if I could play 'You Are My Sunshine' next week. I agreed immediately.",
  "Small group today allowed for individual attention. We took requests and tried to match songs to each person's background.",
];

const QUOTES = [
  { text: "This reminds me of dancing with my husband.", speaker: "resident" },
  { text: "My mother has not spoken in weeks and she just sang every word.", speaker: "family member" },
  { text: "We see real improvement in mood on the days music is scheduled.", speaker: "staff" },
  { text: "Can you come every day?", speaker: "resident" },
  { text: "The calmest our floor has been all month.", speaker: "staff" },
  { text: "I used to play piano too.", speaker: "resident" },
  { text: "Thank you for bringing joy here.", speaker: "family member" },
  { text: "He remembered the lyrics. That never happens anymore.", speaker: "staff" },
];

const EVIDENCE_EXCERPTS = [
  { excerpt: "Residents showed measurable engagement: 12 participants actively sang along during the full 45-minute session.", claim_type: "metric", tags: ["engagement", "quantitative"] },
  { excerpt: "Family member reported that their mother had not sung in years and sang every word during the sing-along.", claim_type: "quote", tags: ["family_feedback", "cognitive_response"] },
  { excerpt: "Staff observation: the floor was the calmest it had been all month during and after the music session.", claim_type: "narrative", tags: ["staff_observation", "behavioral"] },
  { excerpt: "A non-verbal resident in memory care began vocalizing during the chorus and maintained eye contact with the performer.", claim_type: "narrative", tags: ["memory_care", "nonverbal_engagement"] },
  { excerpt: "Interactive rhythm workshop had 100% participation rate among attendees, including residents who typically remain seated.", claim_type: "metric", tags: ["participation", "physical_engagement"] },
  { excerpt: "A resident with advanced dementia requested a specific song by name, demonstrating retained long-term musical memory.", claim_type: "narrative", tags: ["dementia", "memory_retention"] },
  { excerpt: "Volunteer performed for 60 minutes across three locations within the facility, reaching 18 distinct residents.", claim_type: "metric", tags: ["reach", "scale"] },
  { excerpt: "Rainy-day session still achieved strong emotional response despite lower attendance; repeated songs by resident request.", claim_type: "narrative", tags: ["resilience", "resident_choice"] },
];

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  console.log(`Seeding demo data for ${EMAIL}...`);

  // 1. Find user by email
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }
  const user = listData.users.find((u) => u.email === EMAIL);
  if (!user) {
    console.error(`User ${EMAIL} not found.`);
    process.exit(1);
  }
  console.log("Found user:", user.id);

  // 2. Find membership / org
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    console.error("No organization membership found. Please complete onboarding first.");
    process.exit(1);
  }

  const orgId = membership.organization_id;
  const orgName = membership.organizations?.name ?? "Organization";
  console.log(`Targeting org: ${orgName} (${orgId})`);

  // 3. Clean previous synthetic demo data
  console.log("Cleaning previous synthetic demo reflections...");
  const { error: delErr } = await supabase
    .from("volunteer_reflections")
    .delete()
    .eq("organization_id", orgId)
    .eq("source_type", "synthetic_demo");

  if (delErr) {
    console.error("Cleanup warning:", delErr.message);
  }

  // 4. Ensure host sites exist
  const { data: existingSites } = await supabase.from("host_sites").select("id, name").eq("organization_id", orgId);
  let sites = existingSites ?? [];
  if (sites.length === 0) {
    const inserts = HOST_SITES.map((s) => ({ organization_id: orgId, name: s.name, address: s.address }));
    const { data: newSites, error: siteErr } = await supabase.from("host_sites").insert(inserts).select();
    if (siteErr) {
      console.error("Failed to create host sites:", siteErr.message);
      process.exit(1);
    }
    sites = newSites;
    console.log(`Created ${sites.length} host sites.`);
  } else {
    console.log(`Using ${sites.length} existing host sites.`);
  }

  // 5. Ensure activity categories exist
  const { data: existingCats } = await supabase.from("activity_categories").select("id, name").eq("organization_id", orgId);
  let cats = existingCats ?? [];
  if (cats.length === 0) {
    const inserts = CATEGORIES.map((c) => ({ organization_id: orgId, name: c.name }));
    const { data: newCats, error: catErr } = await supabase.from("activity_categories").insert(inserts).select();
    if (catErr) {
      console.error("Failed to create categories:", catErr.message);
      process.exit(1);
    }
    cats = newCats;
    console.log(`Created ${cats.length} activity categories.`);
  } else {
    console.log(`Using ${cats.length} existing categories.`);
  }

  // 6. Ensure active form version exists
  const { data: activeForm } = await supabase
    .from("form_versions")
    .select("id, version_number")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .limit(1)
    .single();

  let formVersionId;
  if (!activeForm) {
    const { data: newForm, error: formErr } = await supabase
      .from("form_versions")
      .insert({ organization_id: orgId, version_number: 1, is_active: true, published_at: new Date().toISOString() })
      .select()
      .single();
    if (formErr) {
      console.error("Failed to create form version:", formErr.message);
      process.exit(1);
    }
    formVersionId = newForm.id;
    console.log("Created active form version v1.", formVersionId);

    // Seed minimal questions so the form is realistic
    const questions = [
      { question_key: "experience", question_text: "Describe your experience today.", question_type: "text", sort_order: 1, is_required: true },
      { question_key: "mood", question_text: "How would you rate the overall mood of the session?", question_type: "rating", sort_order: 2, is_required: true },
      { question_key: "challenges", question_text: "Did you face any challenges?", question_type: "text", sort_order: 3, is_required: false },
    ];
    const { data: qRows } = await supabase.from("organization_questions").insert(
      questions.map((q) => ({ ...q, organization_id: orgId, form_version_id: formVersionId }))
    ).select();
    console.log(`Created ${qRows?.length ?? 0} demo questions.`);
  } else {
    formVersionId = activeForm.id;
    console.log("Using existing active form version:", formVersionId);
  }

  // Fetch questions for answer generation
  const { data: questionRows } = await supabase
    .from("organization_questions")
    .select("id, question_key, question_type, question_text")
    .eq("organization_id", orgId)
    .eq("form_version_id", formVersionId);

  const questions = questionRows ?? [];

  // 7. Create activity sessions
  const sessionRows = SESSION_DEFS.map((def) => ({
    organization_id: orgId,
    activity_category_id: cats[def.cat].id,
    host_site_id: sites[def.site].id,
    date: dateDaysAgo(def.daysAgo),
    title: def.title,
    notes: "Demo session for hackathon.",
    created_by: user.id,
  }));

  const { data: sessions, error: sessErr } = await supabase.from("activity_sessions").insert(sessionRows).select();
  if (sessErr) {
    console.error("Failed to create sessions:", sessErr.message);
    process.exit(1);
  }
  console.log(`Created ${sessions.length} activity sessions.`);

  // 7b. Create invitation tokens for each session
  const tokenRows = sessions.map((s) => ({
    organization_id: orgId,
    session_id: s.id,
    token: crypto.randomBytes(32).toString("hex"),
    is_active: true,
    max_uses: 100,
  }));
  const { data: tokens, error: tokErr } = await supabase.from("session_invitation_tokens").insert(tokenRows).select();
  if (tokErr) {
    console.error("Failed to create tokens:", tokErr.message);
    process.exit(1);
  }
  console.log(`\n🎟️  Demo invitation links (open any to test volunteer form):`);
  for (const t of tokens) {
    const sess = sessions.find((s) => s.id === t.session_id);
    console.log(`   ${sess?.title ?? "Session"}: http://localhost:3000/reflect?token=${t.token}`);
  }
  console.log("");

  // 8. Create volunteer identities (director-only metadata)
  const volInserts = VOLUNTEER_NAMES.map((name) => ({ organization_id: orgId, display_name: name }));
  const { data: volunteers } = await supabase.from("volunteer_identities").insert(volInserts).select();
  if (!volunteers) {
    console.error("Failed to create volunteer identities");
    process.exit(1);
  }
  console.log(`Created ${volunteers.length} volunteer identities.`);

  // 9. Insert ~60 reflections
  const reflectionsToInsert = [];
  let reflectionIndex = 0;
  for (const session of sessions) {
    const count = randomInt(5, 10);
    for (let i = 0; i < count; i++) {
      reflectionsToInsert.push({
        id: uuid(),
        organization_id: orgId,
        session_id: session.id,
        form_version_id: formVersionId,
        volunteer_id: pick(volunteers).id,
        source_type: "synthetic_demo",
        idempotency_key: `seed-${orgId}-${reflectionIndex}`,
        date: session.date,
        host_site_id: session.host_site_id,
        format: pick(FORMATS),
        participant_encounters: randomInt(3, 22),
        minutes_performed: pick([30, 45, 60, 75, 90]),
        submitted_at: new Date(Date.now() - randomInt(0, 5) * 24 * 60 * 60 * 1000).toISOString(),
      });
      reflectionIndex++;
    }
  }

  const { data: insertedReflections, error: reflErr } = await supabase
    .from("volunteer_reflections")
    .insert(reflectionsToInsert)
    .select();

  if (reflErr) {
    console.error("Failed to insert reflections:", reflErr.message);
    process.exit(1);
  }
  console.log(`Inserted ${insertedReflections.length} reflections.`);

  // 10. Insert reflection answers & quotes
  const answerRows = [];
  const quoteRows = [];
  for (let idx = 0; idx < insertedReflections.length; idx++) {
    const r = insertedReflections[idx];
    // Answers
    for (const q of questions) {
      if (q.question_type === "text") {
        answerRows.push({
          organization_id: orgId,
          reflection_id: r.id,
          question_id: q.id,
          question_text_snapshot: q.question_text,
          value_text: pick(REFLECTION_TEXTS),
        });
      } else if (q.question_type === "rating") {
        answerRows.push({
          organization_id: orgId,
          reflection_id: r.id,
          question_id: q.id,
          question_text_snapshot: q.question_text,
          value_number: randomInt(3, 5),
        });
      } else if (q.question_type === "boolean") {
        answerRows.push({
          organization_id: orgId,
          reflection_id: r.id,
          question_id: q.id,
          question_text_snapshot: q.question_text,
          value_boolean: Math.random() > 0.3,
        });
      } else if (q.question_type === "number") {
        answerRows.push({
          organization_id: orgId,
          reflection_id: r.id,
          question_id: q.id,
          question_text_snapshot: q.question_text,
          value_number: randomInt(1, 20),
        });
      }
    }

    // ~40% have quotes
    if (Math.random() < 0.4) {
      const q = pick(QUOTES);
      quoteRows.push({
        organization_id: orgId,
        reflection_id: r.id,
        text: q.text,
        speaker: q.speaker,
        consent_status: "unknown",
      });
    }
  }

  if (answerRows.length > 0) {
    const { error: ansErr } = await supabase.from("reflection_answers").insert(answerRows);
    if (ansErr) console.error("Answer insert warning:", ansErr.message);
    else console.log(`Inserted ${answerRows.length} reflection answers.`);
  }

  if (quoteRows.length > 0) {
    const { error: quoteErr } = await supabase.from("quote_records").insert(quoteRows);
    if (quoteErr) console.error("Quote insert warning:", quoteErr.message);
    else console.log(`Inserted ${quoteRows.length} quotes.`);
  }

  // 11. Insert evidence items (~1.2 per reflection)
  const evidenceRows = [];
  for (const r of insertedReflections) {
    const itemCount = Math.random() < 0.7 ? 1 : 2;
    for (let k = 0; k < itemCount; k++) {
      const tpl = pick(EVIDENCE_EXCERPTS);
      evidenceRows.push({
        organization_id: orgId,
        source_volunteer_reflection_id: r.id,
        excerpt: tpl.excerpt,
        claim_type: tpl.claim_type,
        tags: tpl.tags,
        verification_status: "verified",
        consent_status: "unknown",
      });
    }
  }

  const { data: evidenceItems, error: evErr } = await supabase.from("evidence_items").insert(evidenceRows).select();
  if (evErr) {
    console.error("Evidence insert warning:", evErr.message);
  } else {
    console.log(`Inserted ${evidenceItems.length} evidence items.`);
  }

  // 12. Demo grant
  const { data: existingGrant } = await supabase
    .from("grants")
    .select("id")
    .eq("organization_id", orgId)
    .eq("title", "Community Arts for Aging Wellness Initiative")
    .limit(1)
    .single();

  if (!existingGrant) {
    const { data: grant, error: gErr } = await supabase
      .from("grants")
      .insert({
        organization_id: orgId,
        title: "Community Arts for Aging Wellness Initiative",
        funder_name: "National Endowment for the Arts",
        rfp_url: "https://www.arts.gov/grants/aging-wellness",
        deadline: dateDaysAgo(-120), // ~4 months out
        status: "draft",
      })
      .select()
      .single();

    if (!gErr && grant) {
      console.log("Created demo grant.", grant.id);
      const reqs = [
        { requirement_key: "program_model", question_text: "Describe your program model and how it serves older adults.", sort_order: 1 },
        { requirement_key: "community_need", question_text: "Demonstrate the community need your program addresses.", sort_order: 2 },
        { requirement_key: "evidence_impact", question_text: "Provide evidence of impact on participants and their families.", sort_order: 3 },
        { requirement_key: "budget", question_text: "Outline your budget and sustainability plan.", sort_order: 4 },
      ];
      const { data: grantReqs } = await supabase
        .from("grant_requirements")
        .insert(reqs.map((r) => ({ ...r, organization_id: orgId, grant_id: grant.id })))
        .select();

      if (grantReqs && evidenceItems && evidenceItems.length > 0) {
        // Create a couple of claims and link them to evidence
        const claimInserts = [
          { organization_id: orgId, grant_id: grant.id, claim_text: "Our program reaches over 100 residents monthly across three care facilities.", claim_type: "metric" },
          { organization_id: orgId, grant_id: grant.id, claim_text: "Family members report observable improvements in mood and engagement.", claim_type: "quote" },
          { organization_id: orgId, grant_id: grant.id, claim_text: "Volunteers provide consistent, high-quality musical programming tailored to memory care needs.", claim_type: "narrative" },
        ];
        const { data: claims } = await supabase.from("grant_claims").insert(claimInserts).select();
        if (claims) {
          const citationInserts = [];
          for (const claim of claims) {
            // Link each claim to 1-2 random evidence items
            const ev1 = pick(evidenceItems);
            let ev2 = pick(evidenceItems);
            while (ev2.id === ev1.id) ev2 = pick(evidenceItems);
            citationInserts.push({ organization_id: orgId, claim_id: claim.id, evidence_item_id: ev1.id });
            if (Math.random() > 0.5) {
              citationInserts.push({ organization_id: orgId, claim_id: claim.id, evidence_item_id: ev2.id });
            }
          }
          await supabase.from("evidence_citations").insert(citationInserts);
          console.log(`Created ${claims.length} demo claims with citations.`);
        }
      }
    } else if (gErr) {
      console.error("Grant insert warning:", gErr.message);
    }
  } else {
    console.log("Demo grant already exists; skipped.");
  }

  console.log("\n✅ Demo seed complete!");
  console.log(`   Organization: ${orgName}`);
  console.log(`   Reflections:  ${insertedReflections.length}`);
  console.log(`   Evidence:     ${evidenceItems?.length ?? 0}`);
  console.log(`   Quotes:       ${quoteRows.length}`);
  console.log("   Refresh the dashboard to see live metrics.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
