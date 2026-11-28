/* Q42 Knowledge Base (Workshop tool).
 * Three views inside the Workshop card #workshopToolKnowledge: the category home, search results (and a category's
 * articles), and the article reader. Content is structured data (ARTICLES below, verified only): no network, storage,
 * account or build access, and it is cached offline with the rest of the app shell. Everything is rendered with
 * textContent, never HTML, so article text cannot inject markup.
 * Articles carry a review status. ARTICLES holds VERIFIED articles only, because every file in this repository is served
 * publicly. Drafts are kept in a private store (scripts/knowledge-drafts.cjs) and appear only in Studio running on a
 * local address, from the git-ignored js/knowledge-drafts.local.js, labelled Draft · Unverified on the row and article.
 * Q42b: scripts/build-knowledge-pages.cjs turns the VERIFIED articles here into static public pages under /knowledge/
 * (status 'verified' only; drafts are never published). updated (YYYY-MM-DD) feeds the sitemap and page metadata.
 * A category's intro is the opening line (and search description) of its public page. js/knowledge-public.js reuses
 * search() and marked() for the public search, limited to verified articles. Search also matches an article's aliases
 * (other ways of asking the same question); an alias is never a page of its own. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.KLabsKnowledgeBase=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  const CATEGORIES=Object.freeze([
    {id:'faqs',title:'FAQs',meta:'Quick answers for customers and the bench.',
      intro:'Short answers to the questions rod builders and their customers ask most often.'},
    {id:'techniques',title:'Techniques',meta:'Methods for building and finishing a rod.',
      intro:'Step-by-step methods for building and finishing a custom fishing rod, from layout to the final coat.'},
    {id:'troubleshooting',title:'Troubleshooting',meta:'Find the cause before you fix it.',
      intro:'How to find the cause of common rod-building faults before you start fixing them.'},
    {id:'components',title:'Component Selection',meta:'Choosing guides, seats, grips and blanks.',
      intro:'How to choose rod guides, reel seats, grips and blanks for the way a rod will be fished.'},
    {id:'repairs',title:'Repairs',meta:'Assess, dismantle and rebuild safely.',
      intro:'Fishing rod repairs: assessing damage, taking parts off safely and rebuilding without harming the blank.'}
  ]);

  // VERIFIED articles only. This file ships with the website, so it never holds a draft: unverified articles live in
  // the private draft store and reach Studio only on this computer, through the git-ignored local review file (below).
  // An article is added here only after technical review, with status 'verified'.
  const ARTICLES=Object.freeze([
    {
      "id": "how-do-i-prevent-a-reel-seat-from-rotating",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Planning a reel seat that stays aligned",
      "summary": "Check the fit at every seat support, mark the intended orientation and record the assembly product and its documented cure stage.",
      "aliases": [
        "How do I prevent a reel seat from rotating?",
        "prevent a reel seat from rotating",
        "How to prevent a reel seat from rotating"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Fuji Kogyo, DPS seat specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_DPS.pdf) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | Flex Coat, Rod Builders Epoxy Glue (https://flexcoat.com/products/rod-builders-epoxy-glue)",
      "related": [
        "why-does-my-reel-loosen-in-the-seat",
        "what-are-reel-seat-arbors-and-why-are-they-used",
        "how-do-i-choose-the-correct-reel-seat-size",
        "how-do-i-measure-reel-seat-position"
      ],
      "sections": [
        {
          "heading": "Check the complete dry assembly",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the seat, the intended reel and any supports called for by the seat design. Compare the seat bore and blank diameter at the actual mounting station. Use the specifications for the exact model. A dry seat that rocks on its supports needs its fit reviewed before bonding."
            }
          ]
        },
        {
          "heading": "Give the seat a visible alignment reference",
          "blocks": [
            {
              "type": "p",
              "text": "With the reel sitting in the planned orientation, mark a reference you can check again after removing the reel. Record the seat station and support arrangement. Flex Coat’s handle instructions treat seat location and shimming as separate checks in the assembly."
            }
          ]
        },
        {
          "heading": "Keep the cure record with the fit record",
          "blocks": [
            {
              "type": "p",
              "text": "Use the component and adhesive maker’s assembly instructions for the selected combination. Record the product and its documented service-ready stage as well as the seat position. If the seat body later turns with both hoods, the builder can compare the movement with this original assembly record."
            }
          ]
        }
      ]
    },
    {
      "id": "can-i-reuse-a-reel-seat-after-removal",
      "category": "repairs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Assessing a removed reel seat for possible reuse",
      "summary": "Identify the seat, inspect its accessible parts and compare its dimensions with the proposed build before asking whether it can be reused.",
      "aliases": [
        "Can I reuse a reel seat after removal?",
        "reuse a reel seat after removal"
      ],
      "tags": [
        "repairs",
        "fault",
        "diagnosis"
      ],
      "source": "Fuji Kogyo, DPS seat specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_DPS.pdf) | CTS Fishing, Rod Repairs & Warranty Support (https://ctsfishing.com/repairs/)",
      "related": [
        "how-do-i-prevent-a-reel-seat-from-rotating",
        "how-do-i-choose-the-correct-reel-seat-size",
        "can-i-replace-a-damaged-guide-ring"
      ],
      "sections": [
        {
          "heading": "Confirm what came off the rod",
          "blocks": [
            {
              "type": "p",
              "text": "Record the seat model if legible and look at the barrel, hoods and threads with the part off the rod. Note what you can see and where it is. A split in the barrel is a different observation from a damaged hood or a nut that does not travel smoothly."
            }
          ]
        },
        {
          "heading": "Compare the part with the proposed build",
          "blocks": [
            {
              "type": "p",
              "text": "Use the manufacturer drawing to compare the bore, length and hardware with what the new build requires. Residue can make part of the bore hard to measure, so keep that measurement open if you cannot reach the relevant surface. Dry-fit the intended reel if the part can be checked as it stands."
            }
          ]
        },
        {
          "heading": "Document the reuse decision",
          "blocks": [
            {
              "type": "p",
              "text": "Matching dimensions establish fit only. If the removal history or the condition of the part is uncertain, ask the component maker or repairer whether it is suitable for reuse. Quote a replacement separately if the original cannot be assessed."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-prepare-a-blank-before-bonding-a-grip",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Checking a blank before bonding a rod grip",
      "summary": "Dry-fit the grip at its exact station and confirm the surface and adhesive instructions for the blank and grip materials before mixing.",
      "aliases": [
        "How do I prepare a blank before bonding a grip?",
        "prepare a blank before bonding a grip",
        "How to prepare a blank before bonding a grip"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | WEST SYSTEM, Surface Preparation (https://www.westsystem.com/instruction/epoxy-basics/surface-preparation/) | Flex Coat, Rod Builders Epoxy Glue (https://flexcoat.com/products/rod-builders-epoxy-glue)",
      "related": [
        "how-should-i-measure-a-tapered-grip",
        "what-is-the-difference-between-rod-building-epoxy-adhesive-and-thread-finish",
        "what-causes-fisheyes-in-rod-finish",
        "why-does-rod-finish-remain-tacky"
      ],
      "sections": [
        {
          "heading": "Make the grip position repeatable",
          "blocks": [
            {
              "type": "p",
              "text": "Mark the station and identify both grip ends. Dry fit the grip against its adjoining seat or check and record the bore fit you found. Flex Coat’s cork assembly example fits the cork to the taper before bonding. Keep this measurement separate from any decision about surface treatment."
            }
          ]
        },
        {
          "heading": "Identify the surfaces involved",
          "blocks": [
            {
              "type": "p",
              "text": "Record the blank model and finish and the actual grip material. Check the adhesive maker’s directions for the chosen surfaces, and the blank maker’s directions for its coating. WEST SYSTEM distinguishes surfaces by material in its own guidance, which illustrates why a general epoxy preparation recipe does not establish compatibility with a finished blank."
            }
          ]
        },
        {
          "heading": "Keep the documented preparation with the job",
          "blocks": [
            {
              "type": "p",
              "text": "Write down the product and the preparation approved for those parts before starting. If the instructions leave the blank coating or grip material unspecified, ask the maker rather than borrowing an abrasive grade or cleaning method from a different application."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-a-rod-bend-unevenly",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why a fishing rod can bend unevenly",
      "summary": "Compare the observed curve with the intended action and recorded guide layout. A local change needs its own observation and assessment.",
      "aliases": [
        "Why does a rod bend unevenly?",
        "a rod bend unevenly",
        "a fishing rod bend unevenly"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "Shimano Canada, Shimano FAQ (https://fishshopcanada.shimano.com/pages/shimano-faq) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | Tom Kirkman, hosted by North Fork Composites, Rod Failure (https://northforkcomposites.com/wp-content/uploads/2019/10/Rod_Break_Article.pdf)",
      "related": [
        "what-is-the-difference-between-rod-power-and-action",
        "what-is-static-guide-testing",
        "why-does-my-rod-cast-poorly-despite-premium-components",
        "what-causes-line-slap-during-a-cast"
      ],
      "sections": [
        {
          "heading": "Name what you observed",
          "blocks": [
            {
              "type": "p",
              "text": "Some action profiles concentrate more bend near the top, and some spread it farther down the blank. Identify whether the observation is a broad bend profile or a local change at one station. Record the rod and section instead of concluding from the word uneven alone."
            }
          ]
        },
        {
          "heading": "Compare against the same setup",
          "blocks": [
            {
              "type": "p",
              "text": "Use the original layout or check record for that rod, including joint positions, guide stations and the conditions of the observation. Fuji describes looking at the bend and line path together. If a guide or joint differs from the previous record, note the difference before assigning a cause."
            }
          ]
        },
        {
          "heading": "Record a new or unexplained change separately",
          "blocks": [
            {
              "type": "p",
              "text": "A change observed after an impact is a separate question about condition. Preserve the photos and the history for an assessment. A comparison of the bend is useful information for the maker, not a finding about the condition of the blank wall."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-thread-finish-crack-near-a-guide-foot",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why thread finish cracks near a guide foot",
      "summary": "Record the crack’s location and the finish system used before deciding whether the visible fault is confined to the coating.",
      "aliases": [
        "Why does thread finish crack near a guide foot?",
        "thread finish crack near a guide foot"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "Flex Coat, Rod Wrapping Finish Tips (https://flexcoat.com/blogs/using-flex-coat-finish/rod-wrapping-finish-tips) | Tom Kirkman, hosted by North Fork Composites, Rod Failure (https://northforkcomposites.com/wp-content/uploads/2019/10/Rod_Break_Article.pdf)",
      "related": [
        "how-do-i-troubleshoot-an-uneven-guide-wrap-finish",
        "why-do-guides-crack-or-lose-inserts",
        "why-does-my-rod-cast-poorly-despite-premium-components",
        "what-causes-line-slap-during-a-cast"
      ],
      "sections": [
        {
          "heading": "Locate the line relative to the foot",
          "blocks": [
            {
              "type": "p",
              "text": "Use side light to record whether the crack follows the end of the foot, runs across the wrap or extends beyond the finished area. Compare the neighbouring guide. A photograph from two directions gives the repairer a better reference than the description cracked epoxy alone."
            }
          ]
        },
        {
          "heading": "Check what the wraps share",
          "blocks": [
            {
              "type": "p",
              "text": "Record which finish, mix and colour-preserving product were used, if known. Flex Coat flags mix accuracy and colour preserver as items to review when its finish cracks around guide feet. These are product-specific checks rather than a diagnosis for every finish or rod."
            }
          ]
        },
        {
          "heading": "Keep observations about the frame separate",
          "blocks": [
            {
              "type": "p",
              "text": "Record any visible change in guide position or surrounding blank finish. If you cannot tell which layer is affected, say so before asking about repair. The finish maker can review coating details while the rod repairer assesses the part and blank."
            }
          ]
        }
      ]
    },
    {
      "id": "diamond-cross-wrap-layout",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Planning a diamond wrap in Thread Design Studio",
      "summary": "Use the digital diamond layout to identify reference lines and crossing marks, and verify the printed scale before using a physical sample.",
      "aliases": [
        "How to lay out a diamond cross wrap",
        "How do I plan a diamond cross wrap",
        "plan a diamond cross wrap",
        "How to plan a diamond cross wrap"
      ],
      "tags": [
        "techniques"
      ],
      "source": "K-Labs Studio, Diamond layout and marking-guide implementation (K-Labs Studio: thread-studio/METHOD.md, thread-studio/src/crosswrap.js:65,156,267, thread-studio/src/tests-cross.js)",
      "related": [
        "how-do-i-verify-a-printed-wrap-template-is-to-scale",
        "why-do-decorative-wraps-wander-off-alignment",
        "why-do-thread-wraps-have-gaps",
        "how-tight-should-rod-wrapping-thread-be"
      ],
      "sections": [
        {
          "heading": "Set up a digital layout",
          "blocks": [
            {
              "type": "p",
              "text": "Open the diamond design and enter the measured diameter at the area you plan to cover. Treat crossing spacing as a design input. In Studio’s base cylindrical model, the two reference lines are opposite one another. One set of marks falls half a spacing between the marks on the other line."
            }
          ]
        },
        {
          "heading": "Read the marked plan",
          "blocks": [
            {
              "type": "p",
              "text": "Use the marking guide and preview together to identify the start and which line each crossing belongs to. Check the printed scale before transferring the marks. The workshop view identifies the order of modelled passes and which direction the thread follows."
            }
          ]
        },
        {
          "heading": "Keep the evidence with the design",
          "blocks": [
            {
              "type": "p",
              "text": "The digital crossing positions and continuity of the thread paths are checked by the engine tests. The modelled thread sequence and any suggested starting spacing still need confirmation on a sample for your materials. Keep the printed plan and record changes made on the sample separately."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-avoid-bubbles-in-thread-finish",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Identifying bubbles in rod thread finish",
      "summary": "Distinguish air already in the mix from bubbles that appear at a guide foot, then check the finish maker’s process for the source you saw.",
      "aliases": [
        "How do I avoid bubbles in thread finish?",
        "avoid bubbles in thread finish",
        "How to avoid bubbles in thread finish"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Measuring and Mixing (https://flexcoat.com/blogs/using-flex-coat-finish/measuring-and-mixing) | Flex Coat, Rod Wrapping Finish Tips (https://flexcoat.com/blogs/using-flex-coat-finish/rod-wrapping-finish-tips)",
      "related": [
        "why-does-thread-finish-turn-cloudy",
        "what-causes-fisheyes-in-rod-finish",
        "why-does-rod-finish-remain-tacky",
        "what-causes-finish-sagging-on-guide-wraps"
      ],
      "sections": [
        {
          "heading": "Observe when they first appear",
          "blocks": [
            {
              "type": "p",
              "text": "Look at the mix before it goes on the rod. A cloud of small bubbles already in the cup points to a different stage from isolated bubbles that appear only near a foot after coating. Flex Coat documents both appearances."
            }
          ]
        },
        {
          "heading": "Trace the mixing process",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the tools and mixing motion with the instructions for the product. Flex Coat distinguishes thorough mixing from whipping in air. Record the cup, stirrer and when you first saw froth rather than assuming the blank caused it."
            }
          ]
        },
        {
          "heading": "Record the location on the rod",
          "blocks": [
            {
              "type": "p",
              "text": "If the mix looked clear but bubbles occurred at the base of one frame, note the affected guide and wrap edge. A photo of that location and a record of the product are better starting points for the maker than a picture of the whole rod alone."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-prevent-guide-feet-showing-through-thread-wraps",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why a guide foot shows through a thread wrap",
      "summary": "Distinguish a visible silhouette beneath translucent thread from exposed metal or a ridge where the wrap crosses the guide foot.",
      "aliases": [
        "How do I prevent guide feet showing through thread wraps?",
        "prevent guide feet showing through thread wraps",
        "How to prevent guide feet showing through thread wraps"
      ],
      "tags": [
        "thread",
        "wraps",
        "decoration"
      ],
      "source": "Fuji Kogyo, EZ thread technical sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/11/2022_ez_01.pdf)",
      "related": [
        "what-causes-thread-tunnels-beside-guide-feet",
        "why-do-thread-wraps-have-gaps",
        "how-tight-should-rod-wrapping-thread-be"
      ],
      "sections": [
        {
          "heading": "Look from two directions",
          "blocks": [
            {
              "type": "p",
              "text": "View the wrap straight on for a change in colour, then from the side for a raised line or lifted turns. A visible silhouette under a continuous thread layer is a different observation from a gap that exposes metal."
            }
          ]
        },
        {
          "heading": "Check the chosen thread and finish",
          "blocks": [
            {
              "type": "p",
              "text": "Compare a sample using the intended thread and background. Fuji, for example, offers opaque and transparent EZ thread variants. A visible silhouette under a continuous wrap can be an appearance choice rather than evidence of exposed metal."
            }
          ]
        },
        {
          "heading": "Isolate the point where coverage changes",
          "blocks": [
            {
              "type": "p",
              "text": "If the problem is raised thread or a gap, mark the part of the foot where it starts. Review the dry wrap and compare how the turns meet at the transition. The manufacturer’s wrap instructions for the chosen thread and frame guide that assessment."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-troubleshoot-an-uneven-guide-wrap-finish",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Troubleshooting an uneven guide-wrap finish",
      "summary": "Classify the fault by its shape, location and when it developed before deciding which part of the finishing process to review.",
      "aliases": [
        "How do I troubleshoot an uneven guide-wrap finish?",
        "troubleshoot an uneven guide-wrap finish",
        "How to troubleshoot an uneven guide-wrap finish"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Rod Wrapping Finish Tips (https://flexcoat.com/blogs/using-flex-coat-finish/rod-wrapping-finish-tips) | Flex Coat, Measuring and Mixing (https://flexcoat.com/blogs/using-flex-coat-finish/measuring-and-mixing) | WEST SYSTEM, Epoxy Problem Solver (https://www.westsystem.com/instruction/epoxy-problem-solver-faq/)",
      "related": [
        "what-causes-finish-sagging-on-guide-wraps",
        "why-does-rod-finish-remain-tacky",
        "what-causes-fisheyes-in-rod-finish",
        "how-do-i-avoid-bubbles-in-thread-finish"
      ],
      "sections": [
        {
          "heading": "Describe the shape before calling it a cause",
          "blocks": [
            {
              "type": "p",
              "text": "Use side light and note whether there is a ridge over a thread end, a low spot in the coating, or a bead along one edge. A surface feature in one spot differs from a finish that remains tacky across several wraps."
            }
          ]
        },
        {
          "heading": "Compare across the batch",
          "blocks": [
            {
              "type": "p",
              "text": "Note which wraps were coated from the same mix. If the same mark appears at each foot, inspect the underlying wraps. If several different guides share a soft finish, compare the batch record and product conditions first."
            }
          ]
        },
        {
          "heading": "Keep diagnosis and rework separate",
          "blocks": [
            {
              "type": "p",
              "text": "Record product, coat sequence and when the problem appeared. Compare those details with the maker’s troubleshooting guidance before selecting a remedy. A ridge in a cured film and an incomplete cure should be referred to the maker as different problems."
            }
          ]
        }
      ]
    },
    {
      "id": "how-long-should-i-wait-before-using-a-newly-finished-rod",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "When a newly finished rod is ready to use",
      "summary": "Use the maker’s service-ready guidance for the exact finish and assembly adhesive and record the conditions for each.",
      "aliases": [
        "How long should I wait before using a newly finished rod?"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Rod Builders Epoxy Glue (https://flexcoat.com/products/rod-builders-epoxy-glue) | Flex Coat, Rod Wrapping Finish (https://flexcoat.com/products/flex-coat-rod-wrapping-finish) | Flex Coat, Measuring and Mixing (https://flexcoat.com/blogs/using-flex-coat-finish/measuring-and-mixing) | WEST SYSTEM, Epoxy Problem Solver (https://www.westsystem.com/instruction/epoxy-problem-solver-faq/)",
      "related": [
        "why-does-rod-finish-remain-tacky",
        "what-is-the-difference-between-rod-building-epoxy-adhesive-and-thread-finish",
        "what-causes-fisheyes-in-rod-finish",
        "how-do-i-avoid-bubbles-in-thread-finish"
      ],
      "sections": [
        {
          "heading": "Identify which operations are still curing",
          "blocks": [
            {
              "type": "p",
              "text": "List the finish on the guide wraps and any assembly adhesive used in the handle, including the time each was applied. The products can have different readiness stages. Flex Coat gives separate guidance for its assembly glue and wrap finish."
            }
          ]
        },
        {
          "heading": "Read the stage that matches use",
          "blocks": [
            {
              "type": "p",
              "text": "Use the maker’s documented stage for putting the product into service. A working time describes how long you can apply or handle the mix, and a recoat interval tells you when you may add another coat. Neither interval establishes that the rod is ready to fish."
            }
          ]
        },
        {
          "heading": "Compare the actual conditions",
          "blocks": [
            {
              "type": "p",
              "text": "Check the product’s specified conditions against the workshop record. If a coat was added later, record its own application time. Ask the maker when the rod can enter service if the documented conditions or stage do not match the job."
            }
          ]
        }
      ]
    },
    {
      "id": "how-much-epoxy-finish-should-i-use",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Planning how much rod wrap finish you need",
      "summary": "Plan the mix around the product’s measuring limits and the actual wraps, keeping mixed quantity separate from built-up film thickness.",
      "aliases": [
        "How much epoxy finish should I use?"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Rod Wrapping Finish (https://flexcoat.com/products/flex-coat-rod-wrapping-finish) | Flex Coat, Measuring and Mixing (https://flexcoat.com/blogs/using-flex-coat-finish/measuring-and-mixing)",
      "related": [
        "what-causes-finish-sagging-on-guide-wraps",
        "how-long-should-i-wait-before-using-a-newly-finished-rod",
        "what-causes-fisheyes-in-rod-finish",
        "why-does-rod-finish-remain-tacky"
      ],
      "sections": [
        {
          "heading": "Count the areas that will be coated",
          "blocks": [
            {
              "type": "p",
              "text": "List the guide wraps, trim and decorative areas that you plan to coat. A tall frame with long wraps presents a different job from a few short runners. Use any kit coverage estimate as a buying guide rather than a specification for each wrap."
            }
          ]
        },
        {
          "heading": "Plan the measuring setup",
          "blocks": [
            {
              "type": "p",
              "text": "Check the exact finish instructions for the measuring tools and minimum batch they describe. Flex Coat gives separate recommendations for its measuring methods. A small number of wraps does not in itself justify changing the ratio or guessing at a smaller measurable batch."
            }
          ]
        },
        {
          "heading": "Record the film you are aiming for",
          "blocks": [
            {
              "type": "p",
              "text": "A quantity prepared in the cup and the amount on each wrap are different measurements. If you want a lighter coat, compare the coating options and manufacturer’s instructions for the intended build. Keep the product and coat count with the job notes."
            }
          ]
        }
      ]
    },
    {
      "id": "how-tight-should-rod-wrapping-thread-be",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Setting rod-wrapping thread tension",
      "summary": "Set up a steady feed and use a dry sample to judge whether the turns stay in place through the changes in the wrap profile.",
      "aliases": [
        "How tight should rod-wrapping thread be?"
      ],
      "tags": [
        "thread",
        "wraps",
        "decoration"
      ],
      "source": "Fuji Kogyo, Hand rod wrapper specification (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_rodbuilding_03.pdf) | Fuji Kogyo, EZ thread technical sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/11/2022_ez_01.pdf)",
      "related": [
        "why-do-thread-wraps-have-gaps",
        "what-causes-thread-tunnels-beside-guide-feet",
        "how-do-i-prevent-guide-feet-showing-through-thread-wraps"
      ],
      "sections": [
        {
          "heading": "Start with repeatable feed",
          "blocks": [
            {
              "type": "p",
              "text": "Route the thread through the wrapper as its maker shows, and check that it feeds steadily. Fuji’s hand wrapper includes a tensioner. Record the setting on your wrapper if you need to repeat the comparison with the same spool."
            }
          ]
        },
        {
          "heading": "Judge the wrap on a sample",
          "blocks": [
            {
              "type": "p",
              "text": "Lay several turns and compare how they sit next to one another as the profile changes. The chosen thread can affect how readily a turn slips. Fuji describes that behaviour for its EZ thread. Compare the sample at a known setting rather than using one tension number for every material."
            }
          ]
        },
        {
          "heading": "Identify what moved",
          "blocks": [
            {
              "type": "p",
              "text": "If the turns stop tracking evenly, note whether the thread feed changed, the blank shifted in its supports, or the frame moved during the dry wrap. Restore a consistent reference and compare again with one setting changed at a time."
            }
          ]
        }
      ]
    },
    {
      "id": "what-causes-finish-sagging-on-guide-wraps",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why thread finish sags on a rod wrap",
      "summary": "Locate the pooling or ridge and compare the film, support and rotation with the finish maker’s directions for that product.",
      "aliases": [
        "What causes finish sagging on guide wraps?"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Finish Application Wave Technique (https://flexcoat.com/blogs/instructional-videos/flex-coat-rod-building-finish-application-wave-technique) | Flex Coat, Rod Wrapping Finish (https://flexcoat.com/products/flex-coat-rod-wrapping-finish) | WEST SYSTEM, Epoxy Problem Solver (https://www.westsystem.com/instruction/epoxy-problem-solver-faq/)",
      "related": [
        "how-do-i-troubleshoot-an-uneven-guide-wrap-finish",
        "how-much-epoxy-finish-should-i-use",
        "what-causes-fisheyes-in-rod-finish",
        "why-does-rod-finish-remain-tacky"
      ],
      "sections": [
        {
          "heading": "Distinguish pooling from the shape below",
          "blocks": [
            {
              "type": "p",
              "text": "A bead that develops during levelling is a different observation from a ridge visible at the same place in the dry wrap. Use side light and note when the shape first appeared. Compare a neighbouring wrap from the same mix."
            }
          ]
        },
        {
          "heading": "Review the film and handling record",
          "blocks": [
            {
              "type": "p",
              "text": "Record the product, coat sequence and how the rod was supported while the coat levelled. Flex Coat describes thinner and higher-build options and its own approach to even coverage. The support and rotation setting are worth recording when one wrap pools and others do not."
            }
          ]
        },
        {
          "heading": "Use the maker’s remedy for the product",
          "blocks": [
            {
              "type": "p",
              "text": "Before trying to flatten a cured edge or coating over it, determine whether the issue is a local run or a batch that has not cured as expected. Compare the recorded conditions with the maker’s guidance on the actual coating."
            }
          ]
        }
      ]
    },
    {
      "id": "what-causes-fisheyes-in-rod-finish",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What causes fisheyes in rod wrap finish",
      "summary": "A fisheye is a spot where the coating pulls away from the surface. Investigate the local surface and the tools that touched the mix.",
      "aliases": [
        "What causes fisheyes in rod finish?",
        "what causes fisheyes in fishing rod finish"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "WEST SYSTEM, Epoxy Problem Solver (https://www.westsystem.com/instruction/epoxy-problem-solver-faq/) | Flex Coat, Rod Wrapping Finish Tips (https://flexcoat.com/blogs/using-flex-coat-finish/rod-wrapping-finish-tips) | WEST SYSTEM, Surface Preparation (https://www.westsystem.com/instruction/epoxy-basics/surface-preparation/)",
      "related": [
        "how-do-i-avoid-bubbles-in-thread-finish",
        "how-do-i-troubleshoot-an-uneven-guide-wrap-finish",
        "why-does-rod-finish-remain-tacky",
        "what-causes-finish-sagging-on-guide-wraps"
      ],
      "sections": [
        {
          "heading": "Look for retreating coating",
          "blocks": [
            {
              "type": "p",
              "text": "A fisheye leaves a small area with reduced coverage as the wet coating draws away. An air bubble can also leave a round-looking mark. Recording what the coating did while wet makes the two observations easier to distinguish."
            }
          ]
        },
        {
          "heading": "Trace what touched the affected area",
          "blocks": [
            {
              "type": "p",
              "text": "Flex Coat identifies silicone contamination as a cause for its finish. Record whether the defect is confined to a spot, repeated on several wraps or appears on a test sample from the same cup. Review which tools, surfaces or handling steps those areas shared."
            }
          ]
        },
        {
          "heading": "Check the finish maker before rework",
          "blocks": [
            {
              "type": "p",
              "text": "Use the product’s surface and equipment guidance to plan the next sample. Compare results before deciding whether the same problem is likely on the rod. A clean-looking surface alone is not evidence of compatibility with another cleaner or coating."
            }
          ]
        }
      ]
    },
    {
      "id": "what-causes-thread-tunnels-beside-guide-feet",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Recognising thread tunnels beside guide feet",
      "summary": "A tunnel is an opening under turns bridging a guide-foot edge. Locate it in the dry wrap so it is not confused with a finish bubble.",
      "aliases": [
        "What causes thread tunnels beside guide feet?"
      ],
      "tags": [
        "thread",
        "wraps",
        "decoration"
      ],
      "source": "Flex Coat, Measuring and Mixing (https://flexcoat.com/blogs/using-flex-coat-finish/measuring-and-mixing) | Fuji Kogyo, EZ thread technical sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/11/2022_ez_01.pdf)",
      "related": [
        "how-do-i-prevent-guide-feet-showing-through-thread-wraps",
        "how-tight-should-rod-wrapping-thread-be",
        "why-do-thread-wraps-have-gaps"
      ],
      "sections": [
        {
          "heading": "Inspect the edge of the foot",
          "blocks": [
            {
              "type": "p",
              "text": "Look at the guide foot from the side. Where the turns bridge the transition from foot to blank, you may see a space underneath. Flex Coat identifies an air pocket at the foot, blank and thread junction. Describe a visible gap in the dry wrap separately from any bubble seen after coating."
            }
          ]
        },
        {
          "heading": "Compare a dry wrap on the same profile",
          "blocks": [
            {
              "type": "p",
              "text": "Use a sample with a similar frame shape and watch where the thread first climbs the edge. Note whether the turns stay next to one another through that part of the profile. The spool and feed settings belong in the sample notes."
            }
          ]
        },
        {
          "heading": "Keep the foot location in the report",
          "blocks": [
            {
              "type": "p",
              "text": "If the opening is repeated on several guides, identify whether they are the same frame or whether it only occurs on one style of foot. Use that comparison to discuss the wrap with the component maker rather than choosing a remedy solely from the word tunnel."
            }
          ]
        }
      ]
    },
    {
      "id": "why-do-thread-wraps-have-gaps",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why fishing rod thread wraps develop gaps",
      "summary": "Find where adjacent turns first separate, then compare thread feed and placement before changing thread or adding finish.",
      "aliases": [
        "Why do thread wraps have gaps?",
        "thread wraps have gaps"
      ],
      "tags": [
        "thread",
        "wraps",
        "decoration"
      ],
      "source": "Fuji Kogyo, EZ thread technical sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/11/2022_ez_01.pdf) | Fuji Kogyo, Hand rod wrapper specification (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_rodbuilding_03.pdf)",
      "related": [
        "how-tight-should-rod-wrapping-thread-be",
        "what-causes-thread-tunnels-beside-guide-feet",
        "how-do-i-prevent-guide-feet-showing-through-thread-wraps"
      ],
      "sections": [
        {
          "heading": "Inspect the turns before coating",
          "blocks": [
            {
              "type": "p",
              "text": "Locate the first gap and note whether the separation is in the middle of a plain wrap or where the surface changes at a foot. A repeatable location gives you a better starting point than a description of the whole wrap as loose."
            }
          ]
        },
        {
          "heading": "Check feed and the supports",
          "blocks": [
            {
              "type": "p",
              "text": "See whether the spool feeds at the same tension when you repeat the wrap on a sample. Check that the rod is supported in the same position. Fuji’s thread notes recognise that slip and turn placement are affected by the thread used, while the wrapper controls the way it feeds."
            }
          ]
        },
        {
          "heading": "Record the change that helped",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the sample after changing one setting. If steady feed closes gaps on the plain section but the problem returns at a frame edge, log those as separate findings. That avoids changing the wrap recipe for portions that already sit evenly."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-line-touch-the-blank-in-a-spiral-layout",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why line touches the blank on a spiral rod",
      "summary": "Locate the specific span where the line touches the blank, then compare the guide geometry with the spiral method used.",
      "aliases": [
        "Why does line touch the blank in a spiral layout?",
        "line touch the blank in a spiral layout"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | Tom Kirkman, RodMaker Magazine, Simple Spiral Revisited (https://www.rodmakermagazine.com/wp-content/uploads/2025/06/simplespiral.pdf)",
      "related": [
        "what-is-static-guide-testing",
        "where-should-a-spiral-wrap-transition-finish",
        "what-is-a-spiral-wrapped-casting-rod",
        "how-do-i-choose-left-or-right-spiral-orientation"
      ],
      "sections": [
        {
          "heading": "Name the span and condition",
          "blocks": [
            {
              "type": "p",
              "text": "Record the guides on either side of the contact and whether it showed up at rest or in an existing static check. Mark their stations and rotations on the sketch. Contact near the first underside runner differs from contact between two underside runners."
            }
          ]
        },
        {
          "heading": "Read the spiral design before changing spacing",
          "blocks": [
            {
              "type": "p",
              "text": "In Kirkman’s Simple Spiral, the optional side guide is for clearance between the top and underside portions. It serves a different role from an underside runner. A stepped spiral can allocate those jobs differently, so identify the specific plan used before borrowing a correction."
            }
          ]
        },
        {
          "heading": "Recheck the actual layout",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the installed guide height, position and rotation in the affected span with the layout record. Any assessment of a revised assembly should follow the blank and guide maker’s validation guidance. Record whether the contact persisted instead of assuming one change solved it."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-rod-finish-remain-tacky",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why rod thread finish can remain tacky",
      "summary": "Compare the exact product, measuring and mixing record, and elapsed cure conditions before assuming a tacky wrap needs another coat.",
      "aliases": [
        "Why does rod finish remain tacky?",
        "rod finish remain tacky",
        "fishing rod finish remain tacky"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "WEST SYSTEM, Epoxy Problem Solver (https://www.westsystem.com/instruction/epoxy-problem-solver-faq/) | Flex Coat, Rod Wrapping Finish Tips (https://flexcoat.com/blogs/using-flex-coat-finish/rod-wrapping-finish-tips)",
      "related": [
        "how-long-should-i-wait-before-using-a-newly-finished-rod",
        "why-does-thread-finish-turn-cloudy",
        "what-causes-fisheyes-in-rod-finish",
        "how-do-i-avoid-bubbles-in-thread-finish"
      ],
      "sections": [
        {
          "heading": "Separate time from a batch problem",
          "blocks": [
            {
              "type": "p",
              "text": "Check how long the coat has been in the recorded conditions and compare that with the product instructions. If several wraps from one mix remain tacky while wraps from another mix have cured, retain the batch distinction."
            }
          ]
        },
        {
          "heading": "Check the resin and hardener record",
          "blocks": [
            {
              "type": "p",
              "text": "Flex Coat names measurement errors and incomplete mixing as possible reasons for its finish staying sticky. Compare the resin, hardener and measuring method with its instructions. If the quantities were not recorded, list that as missing information rather than diagnosing the ratio from touch alone."
            }
          ]
        },
        {
          "heading": "Use a product-specific disposition",
          "blocks": [
            {
              "type": "p",
              "text": "Different manufacturers give different rework instructions for different degrees of incomplete cure. Contact the finish maker with the batch and condition details before choosing how to deal with the coating. The same symptom across products does not establish the same remedy."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-thread-finish-turn-cloudy",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why clear thread finish can look cloudy",
      "summary": "Note whether cloudiness appears in the mixing cup or only on the rod, then compare the condition with the coating maker’s guidance.",
      "aliases": [
        "Why does thread finish turn cloudy?",
        "thread finish turn cloudy"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Measuring and Mixing (https://flexcoat.com/blogs/using-flex-coat-finish/measuring-and-mixing) | WEST SYSTEM, Epoxy Problem Solver (https://www.westsystem.com/instruction/epoxy-problem-solver-faq/)",
      "related": [
        "how-do-i-avoid-bubbles-in-thread-finish",
        "why-does-rod-finish-remain-tacky",
        "what-causes-fisheyes-in-rod-finish"
      ],
      "sections": [
        {
          "heading": "Locate the haze in the process",
          "blocks": [
            {
              "type": "p",
              "text": "Flex Coat describes appearance changes while its finish is being mixed. That transient appearance is different from a haze that persists in a coating after the maker’s mix procedure or appears later on the rod. Record which stage you saw."
            }
          ]
        },
        {
          "heading": "Describe the pattern in the film",
          "blocks": [
            {
              "type": "p",
              "text": "Note whether the area is a uniform haze, a collection of fine bubbles or a patch that follows one wrap. WEST SYSTEM lists condensation and entrained air for some clear epoxy coatings. Treat those as examples of mechanisms rather than proof that one explains a particular rod finish."
            }
          ]
        },
        {
          "heading": "Record the surroundings and the mix",
          "blocks": [
            {
              "type": "p",
              "text": "Keep the product, application time, conditions and observations for the same batch together. If the manufacturer is assessing the haze, include whether a sample from that mix behaved the same way. Leave the cause open when those observations do not distinguish it."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-check-casting-performance-after-a-build",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Checking casting performance on a finished rod",
      "summary": "Compare repeat casts with the intended outfit and keep a short record of distance, control and any recurring line problems.",
      "aliases": [
        "How do I check casting performance after a build?",
        "check casting performance after a build",
        "How to check casting performance after a build"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "why-does-my-rod-cast-poorly-despite-premium-components",
        "what-causes-line-slap-during-a-cast",
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots"
      ],
      "sections": [
        {
          "heading": "Define what counts as a good cast",
          "blocks": [
            {
              "type": "p",
              "text": "Choose a task the customer will actually use, such as placing a small lure near a target rather than throwing as far as possible. Pick the intended reel, line, leader and a lure within the rod’s specified range. Record those along with wind direction and the reference rod, if you use one."
            }
          ]
        },
        {
          "heading": "Keep the comparison repeatable",
          "blocks": [
            {
              "type": "p",
              "text": "For each setup, make a series of comparable casts in the same direction. Keep the caster, target and rig consistent where possible. Record where the casts land and note how often the knot catches, line hits the blank or the spool overruns. One unusually long cast tells you little about a recurring problem."
            }
          ]
        },
        {
          "heading": "Report the conditions with the result",
          "blocks": [
            {
              "type": "p",
              "text": "Say which conditions you actually checked. For example, a rod may place repeated casts accurately with a short leader while the customer’s longer leader brings the knot into the running train. Record that as a different setup to assess rather than treating it as covered by the first result."
            }
          ]
        }
      ]
    },
    {
      "id": "what-are-checks-and-trim-rings-used-for",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Where checks and trim rings fit on a rod handle",
      "summary": "Identify the mating surfaces for each ring, then use its drawing to match the blank, grip or seat shoulder in the dry assembly.",
      "aliases": [
        "What are checks and trim rings used for?"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, Rodbuilding materials: metal parts (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_metalparts.pdf)",
      "related": [
        "what-is-a-winding-check",
        "how-do-i-measure-a-blank-s-diameter-accurately",
        "how-do-i-choose-guide-ring-material",
        "what-is-the-difference-between-single-foot-and-double-foot-guides"
      ],
      "sections": [
        {
          "heading": "Look at the drawing before the finish colour",
          "blocks": [
            {
              "type": "p",
              "text": "A ring at a grip-to-blank transition must fit that blank station. A trim ring at the front of a seat can register against a different shoulder. Fuji gives separate drawings for WCH foregrip fittings and WCP seat-front rings, with more than one relevant diameter on some models."
            }
          ]
        },
        {
          "heading": "Measure the two pieces that meet it",
          "blocks": [
            {
              "type": "p",
              "text": "Identify what passes through the ring and what seats against its edge or recess. Compare those dimensions with the part drawing. If two rings share a nominal size, check both their bore and outside profile before treating them as interchangeable."
            }
          ]
        },
        {
          "heading": "Put it on the assembly sketch",
          "blocks": [
            {
              "type": "p",
              "text": "Label each ring by station and part number, for example seat front or tip-side end of the foregrip. Check the widths with the grips and seat together. A different trim width can shift the shoulder used to measure the handle."
            }
          ]
        }
      ]
    },
    {
      "id": "when-is-replacement-better-than-repair",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "When to replace a rod part instead of repairing it",
      "summary": "Compare component repair, a matching replacement section and a full replacement using the actual damage, parts availability and quote.",
      "aliases": [
        "When is replacement better than repair?",
        "replacement better than repair"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "CTS Fishing, Rod Repairs & Warranty Support (https://ctsfishing.com/repairs/) | Tenkara Rod Co., Warranty and Repair Support (https://www.tenkararodco.com/pages/repairs)",
      "related": [
        "how-do-i-document-a-repair-before-starting",
        "how-do-i-quote-a-rod-repair",
        "how-should-i-clean-saltwater-fishing-rods",
        "how-do-i-inspect-a-custom-rod-before-a-fishing-trip"
      ],
      "sections": [
        {
          "heading": "Get an assessment at the right level",
          "blocks": [
            {
              "type": "p",
              "text": "Start with the rod model, section and problem the customer reports. Ask whether a single fitted part, a complete section or the whole rod is being assessed. CTS and Tenkara Rod Co. offer different service routes, so check the maker before assuming the workshop is the only option."
            }
          ]
        },
        {
          "heading": "Confirm that a section is an actual match",
          "blocks": [
            {
              "type": "p",
              "text": "The replacement must be confirmed for the model and version. A similarly named current rod may use different section dimensions. Ask the supplier which part fits the remaining rod and whether it is available before promising the option."
            }
          ]
        },
        {
          "heading": "Put practical choices side by side",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the quoted cost, delivery time and any parts that would be retained. For example, a matching section may preserve the handle and the other sections. If the maker has no matching part, record that fact before comparing a rebuild assessment with a replacement rod."
            }
          ]
        }
      ]
    },
    {
      "id": "can-i-replace-a-damaged-guide-ring",
      "category": "repairs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Can a damaged rod guide insert be replaced?",
      "summary": "Identify the guide frame and insert, then check whether the maker services that insert or supplies a complete guide assembly.",
      "aliases": [
        "Can I replace a damaged guide ring?",
        "replace a damaged guide ring"
      ],
      "tags": [
        "repairs",
        "fault",
        "diagnosis"
      ],
      "source": "Fuji Kogyo, How to read product codes (https://www.fujitackle.com/fujitackle/productcode/) | Fuji Kogyo, Company history (https://www.fujitackle.com/en/company/history/) | Fuji Kogyo, LG tip-top specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_LG_stain.pdf)",
      "related": [
        "why-do-guides-crack-or-lose-inserts",
        "what-does-guide-size-numbering-mean"
      ],
      "sections": [
        {
          "heading": "Identify the frame as well as the ring",
          "blocks": [
            {
              "type": "p",
              "text": "Photograph the guide from the side and front, and record its position. Check the guide model and the part of the assembly that is damaged. Fuji identifies ring material and frame as separate product attributes. The nominal ring number alone does not establish an insert fit."
            }
          ]
        },
        {
          "heading": "Ask what the maker supplies",
          "blocks": [
            {
              "type": "p",
              "text": "Check the maker or repairer for an approved insert service for the exact frame. Fuji’s own guide history illustrates designs in which the ring and the surrounding frame were engineered together. If there is no documented insert service for the model, quote the complete compatible guide as the replacement option."
            }
          ]
        },
        {
          "heading": "Keep the quote specific",
          "blocks": [
            {
              "type": "p",
              "text": "Record whether the quote is for an insert service or the whole guide. For a complete guide, compare the frame footprint, height and line opening with what is on the rod. If the required part is a tip top, record the tube fit separately."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-a-ferrule-joint-loosen-during-fishing",
      "category": "repairs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why a fishing rod ferrule works loose",
      "summary": "Compare the joint’s alignment and engagement with its normal seated condition, and use the rod maker’s guidance for the exact joint style.",
      "aliases": [
        "Why does a ferrule joint loosen during fishing?",
        "a ferrule joint loosen during fishing"
      ],
      "tags": [
        "repairs",
        "fault",
        "diagnosis"
      ],
      "source": "Orvis, How Not to Break Your Fly Rod (https://news.orvis.com/fly-fishing/classic-pro-tips-how-not-to-break-your-fly-rod) | Scott Fly Rods via Flyfish Europe, Scott care and maintenance (https://flyfisheurope.com/flyfisheurope/care-and-maintenance/2785)",
      "related": [
        "how-should-i-store-multi-piece-rods",
        "how-do-i-inspect-a-custom-rod-before-a-fishing-trip",
        "can-i-replace-a-damaged-guide-ring"
      ],
      "sections": [
        {
          "heading": "Look for change at the joint",
          "blocks": [
            {
              "type": "p",
              "text": "A ferrule can lose engagement or alignment during use. Compare it with how that particular rod sits when assembled as the maker describes. Orvis identifies reduced overlap as a consequence of a joint backing out."
            }
          ]
        },
        {
          "heading": "Allow for intentional gaps",
          "blocks": [
            {
              "type": "p",
              "text": "Some internal ferrules show a gap in their seated position. Scott documents this for its internal ferrules. Compare the joint with the instructions for its design rather than using the appearance of another rod as the reference."
            }
          ]
        },
        {
          "heading": "Describe a recurring change to the maker",
          "blocks": [
            {
              "type": "p",
              "text": "If the same section repeatedly moves, record which joint, whether it turned or moved axially, and what the seated condition looked like at the start. The record gives the maker more to assess than a description of a visible gap alone."
            }
          ]
        }
      ]
    },
    {
      "id": "how-many-running-guides-should-i-use",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing the number of running guides on a rod",
      "summary": "Start with a layout for the actual blank and guide system, then review the running section where the line path and blank curve differ.",
      "aliases": [
        "How many running guides should I use?"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "what-is-static-guide-testing",
        "what-is-the-difference-between-reduction-guides-and-running-guides",
        "how-do-i-determine-guide-spacing-on-a-spinning-rod",
        "how-do-i-determine-guide-spacing-on-a-casting-rod"
      ],
      "sections": [
        {
          "heading": "Define which guides you are counting",
          "blocks": [
            {
              "type": "p",
              "text": "On the bench sheet, separate the reduction or entry guides, the transition, the runners and the top. A count copied from a chart is useful only when you know which of those pieces it includes. Fuji’s reference drawings describe the guide roles as well as their stations."
            }
          ]
        },
        {
          "heading": "Look at the shape of the running section",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the guide stations with the assembled blank and the recorded line path from the layout check. Mark long spans where the line takes a different path from the bend. Before adding a runner, consider which neighbouring guide positions were actually checked and what the proposed change is meant to address."
            }
          ]
        },
        {
          "heading": "Record the reason for the final count",
          "blocks": [
            {
              "type": "p",
              "text": "If a runner was added near the tip, identify the span it divided and keep both versions of the layout in the job notes. The same nominal rod length can take a different arrangement when the blank or the guide heights change."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-static-guide-testing",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What a static guide check tells you",
      "summary": "A static guide check compares the line path with the bent blank. A calculated spacing gives starting positions for that physical assessment.",
      "aliases": [
        "What is static guide testing?",
        "static guide testing",
        "Can calculated guide spacing replace static testing?"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-many-running-guides-should-i-use",
        "how-do-i-check-casting-performance-after-a-build",
        "how-do-i-determine-guide-spacing-on-a-spinning-rod",
        "how-do-i-determine-guide-spacing-on-a-casting-rod"
      ],
      "sections": [
        {
          "heading": "Read two shapes at once",
          "blocks": [
            {
              "type": "p",
              "text": "In a static guide check, the builder observes the bend of the actual blank and the segments of line between guides. The record can show a span with line contact or a sharp departure from the guide next to it. Fuji lists the bend and line path as separate checks in its guide reference."
            }
          ]
        },
        {
          "heading": "Use the spacing plan as the starting point",
          "blocks": [
            {
              "type": "p",
              "text": "A chart or calculation supplies stations from its inputs. It has no observation of the actual blank, fitted frame heights or finished line path. Compare the plan with the physical assessment specified for the blank and guide system. Keep a calculation on the build sheet as a proposal until the physical observations are recorded."
            }
          ]
        },
        {
          "heading": "Keep static and casting results separate",
          "blocks": [
            {
              "type": "p",
              "text": "A static check reports what happened in a stationary condition. An on-water cast also involves the lure, reel and moving line. Keep the two results separate so the reader knows whether a note refers to the bend or to observed casting behaviour."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-difference-between-rod-building-epoxy-adhesive-and-thread-finish",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Rod-building epoxy adhesive and thread finish",
      "summary": "Match the epoxy to the job on its label: bonding handle components or coating thread wraps after they have been laid.",
      "aliases": [
        "What is the difference between rod-building epoxy adhesive and thread finish?",
        "rod-building epoxy adhesive and thread finish"
      ],
      "tags": [
        "adhesives",
        "finishing"
      ],
      "source": "Flex Coat, Rod Builders Epoxy Glue (https://flexcoat.com/products/rod-builders-epoxy-glue) | Flex Coat, Rod Wrapping Finish (https://flexcoat.com/products/flex-coat-rod-wrapping-finish)",
      "related": [
        "what-tools-are-essential-for-a-beginner-rod-builder"
      ],
      "sections": [
        {
          "heading": "Start with the intended application",
          "blocks": [
            {
              "type": "p",
              "text": "Assembly adhesive is sold to bond parts in the handle assembly or other listed joints. Thread finish is made to coat the wraps. Flex Coat publishes separate products for those jobs, even though both are sold as epoxies."
            }
          ]
        },
        {
          "heading": "Record the formula with the job",
          "blocks": [
            {
              "type": "p",
              "text": "Write down the exact product before setting up the bench. A finish maker may offer different film builds within the same family. Flex Coat has separate High and Lite Build finishes. That distinction applies within its wrap coating range and does not make either a substitute for the assembly glue."
            }
          ]
        },
        {
          "heading": "Match instructions to the container",
          "blocks": [
            {
              "type": "p",
              "text": "Find the current instructions for the exact product and application. Keep the two product names separate on the build record. If a customer asks what was used on a grip and on the guides, the records should identify both products independently."
            }
          ]
        }
      ]
    },
    {
      "id": "where-should-a-spiral-wrap-transition-finish",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Where a spiral guide transition finishes",
      "summary": "Identify the first guide in the underside run and record its station separately from any side guide used to keep line clear of the blank.",
      "aliases": [
        "Where should a spiral wrap transition finish?",
        "a spiral wrap transition finish"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "Tom Kirkman, RodMaker Magazine, Simple Spiral Revisited (https://www.rodmakermagazine.com/wp-content/uploads/2025/06/simplespiral.pdf) | RodMaker technical article hosted by U-40, Spiral Wrap for Casting Rods (https://www.u-40.com/Userfiles/PDF-Articles/RodMaker/Finishing%20tips.pdf)",
      "related": [
        "what-is-a-spiral-wrapped-casting-rod",
        "how-should-i-number-guides-in-a-spiral-layout",
        "how-do-i-choose-left-or-right-spiral-orientation",
        "what-is-an-offset-stripper-guide"
      ],
      "sections": [
        {
          "heading": "Identify the end by orientation",
          "blocks": [
            {
              "type": "p",
              "text": "On the bench plan, mark the first guide that sits in line with the underside runners. That is where the line path joins the underside run. Record its reference and station. Its position cannot be inferred from the rod length alone."
            }
          ]
        },
        {
          "heading": "Label the parts on either side",
          "blocks": [
            {
              "type": "p",
              "text": "A stepped spiral can use rotating guides before reaching the underside. In Kirkman’s Simple Spiral, the optional side guide has a clearance role, while the first underside runner still belongs to the main run. Keep those parts separate on the drawing."
            }
          ]
        },
        {
          "heading": "Review the entry into the underside run",
          "blocks": [
            {
              "type": "p",
              "text": "Read the path from the preceding guide to that first underside frame and then to the next runner. If a frame or rotation changes, revisit those two segments on the drawing and on the actual assembly. Record the chosen end of the transition instead of applying an angle or distance from a different method."
            }
          ]
        }
      ]
    },
    {
      "id": "why-do-decorative-wraps-wander-off-alignment",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why decorative rod wraps drift off alignment",
      "summary": "Check the axial reference marks, starting station and pass direction before treating a crossing that wanders as a thread-spacing problem.",
      "aliases": [
        "Why do decorative wraps wander off alignment?",
        "decorative wraps wander off alignment"
      ],
      "tags": [
        "thread",
        "wraps",
        "decoration"
      ],
      "source": "K-Labs, Thread Design Studio digital diamond (K-Labs Studio: thread-studio/METHOD.md, thread-studio/src/crosswrap.js:65,156,267 and tests-cross.js)",
      "related": [
        "diamond-cross-wrap-layout",
        "how-do-i-verify-a-printed-wrap-template-is-to-scale"
      ],
      "sections": [
        {
          "heading": "Find the first crossing that moved",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the first misplaced crossing with its reference mark. If crossings are already offset at the first pass, look at the start station and line identity. A change that begins later is easier to isolate when you can name the first mark and pass where it appears."
            }
          ]
        },
        {
          "heading": "Check the reference lines as a pair",
          "blocks": [
            {
              "type": "p",
              "text": "Studio’s base diamond uses opposite A and C reference lines with staggered axial marks. Make sure you are reading the correct column before comparing a crossing with the marking guide. Other patterns can use different mark arrangements."
            }
          ]
        },
        {
          "heading": "Keep the digital and physical checks distinct",
          "blocks": [
            {
              "type": "p",
              "text": "Print template marks as intended by the tool and verify scale before transferring them. The digital geometry and crossing positions are tested in Studio. A physical sample lets you see whether the marks and the actual thread pass agree on your blank."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-diagnose-an-unexplained-line-break",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Diagnosing a break in fishing line",
      "summary": "Keep the broken line and inspect the end, nearby braid and guide path before deciding whether the break began at a knot or a contact point.",
      "aliases": [
        "How do I diagnose an unexplained line break?",
        "diagnose an unexplained line break",
        "How to diagnose an unexplained line break"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "Shimano / PowerPro, Post-trip care for braided line (https://fishshop.shimano.com/blogs/powerpro/post-trip-care-and-maintenance-for-braided-line)",
      "related": [
        "why-do-guides-crack-or-lose-inserts",
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "why-does-my-rod-cast-poorly-despite-premium-components",
        "what-causes-line-slap-during-a-cast"
      ],
      "sections": [
        {
          "heading": "Preserve what you can inspect",
          "blocks": [
            {
              "type": "p",
              "text": "Lay the remaining pieces out in order and note where the leader connection was relative to the visible break. Take a photo before discarding anything. Mark whether nearby line is fuzzy, flattened or nicked, all signs Shimano’s PowerPro care guide includes in its braid inspection."
            }
          ]
        },
        {
          "heading": "Trace the surfaces the line touched",
          "blocks": [
            {
              "type": "p",
              "text": "Inspect the relevant guide openings and any known contact points outside the rod. For example, if the angler saw the line pass a dock edge, record that alongside any mark found in a guide. Finding a rough-looking point is a reason to inspect it, rather than proof that it caused the break."
            }
          ]
        },
        {
          "heading": "Record the result you can support",
          "blocks": [
            {
              "type": "p",
              "text": "Keep the line type, leader, knot, where the break occurred and what you found in the guide train together. If the break point is missing, say so. A repairer can then compare the evidence with the rod without starting from an assumed cause."
            }
          ]
        }
      ]
    },
    {
      "id": "what-causes-line-slap-during-a-cast",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What line slap looks like during a cast",
      "summary": "Line slap is contact between moving line and the blank. Identify where contact occurs before comparing guide or reel changes.",
      "aliases": [
        "What causes line slap during a cast?"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "why-does-my-rod-cast-poorly-despite-premium-components",
        "how-do-i-determine-guide-spacing-on-a-spinning-rod",
        "why-does-my-rod-feel-tip-heavy",
        "why-do-guides-crack-or-lose-inserts"
      ],
      "sections": [
        {
          "heading": "Locate the contact",
          "blocks": [
            {
              "type": "p",
              "text": "On a spinning rod, look for contact between the outgoing line and the blank near the reduction guides. Fuji’s KR notes identify line slap as one reason for using a tall entry frame in that system. Noise alone cannot identify where contact occurred."
            }
          ]
        },
        {
          "heading": "Keep the incident description specific",
          "blocks": [
            {
              "type": "p",
              "text": "Note whether the issue appears on line release or later in the cast. Include the spool, line and leader, and mark the suspected span between guides. If you cannot see contact, describe the sound or tangle and leave line slap as a possibility."
            }
          ]
        },
        {
          "heading": "Compare one change at a time",
          "blocks": [
            {
              "type": "p",
              "text": "If you compare setups, keep the rod and lure the same while checking the line or spool combination. Compare the guide frame positions with the intended reduction layout before replacing parts. Fuji treats the entry and reduction group as a system, so an isolated ring size does not describe the complete path."
            }
          ]
        }
      ]
    },
    {
      "id": "why-do-guides-crack-or-lose-inserts",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why rod guide rings crack or come loose",
      "summary": "Inspect the insert and surrounding frame separately and record any known impact before attributing the failure to a material or design.",
      "aliases": [
        "Why do guides crack or lose inserts?",
        "guides crack or lose inserts"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "Fuji Kogyo, How to read product codes (https://www.fujitackle.com/fujitackle/productcode/) | Fuji Kogyo, Company history (https://www.fujitackle.com/en/company/history/)",
      "related": [
        "can-i-replace-a-damaged-guide-ring",
        "how-do-i-diagnose-an-unexplained-line-break",
        "why-does-my-rod-cast-poorly-despite-premium-components",
        "what-causes-line-slap-during-a-cast"
      ],
      "sections": [
        {
          "heading": "Identify what changed",
          "blocks": [
            {
              "type": "p",
              "text": "Look at the insert edge and the surrounding frame under good light. A missing piece of ceramic, an empty frame and a frame bent against the blank are different observations. Photograph the guide from both sides before comparing it with a replacement."
            }
          ]
        },
        {
          "heading": "Treat impact as a possibility to document",
          "blocks": [
            {
              "type": "p",
              "text": "Ask whether the rod or guide was struck or trapped. Fuji’s historical guide designs illustrate the importance of impact protection and insert retention. Those design features explain what to look at, but they cannot tell you how a particular ring failed from a photo alone."
            }
          ]
        },
        {
          "heading": "Keep the component identification",
          "blocks": [
            {
              "type": "p",
              "text": "Record the guide’s location and the frame and ring model where known. If the guide must be assessed or quoted, pass on the photos and any known contact event. Keep what you found separate from the customer’s account of when it happened."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-my-reel-loosen-in-the-seat",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why a reel loosens in its seat",
      "summary": "Check whether the reel foot moves inside the hoods, a nut backs off, or the entire seat body moves relative to the handle.",
      "aliases": [
        "Why does my reel loosen in the seat?",
        "my reel loosen in the seat"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "Fuji Kogyo, DPS and SBDPS spinning reel seats (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_DPS.pdf)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "what-are-reel-seat-arbors-and-why-are-they-used",
        "why-does-my-rod-cast-poorly-despite-premium-components",
        "what-causes-line-slap-during-a-cast"
      ],
      "sections": [
        {
          "heading": "Locate the movement without the line pulling",
          "blocks": [
            {
              "type": "p",
              "text": "With the rod at rest, watch the foot and both hoods while checking where the movement appears. Look separately at the nut and the barrel relative to the grip. A moving reel foot and a moving seat body identify different fit questions for the workshop."
            }
          ]
        },
        {
          "heading": "Check the design and the reel together",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the actual reel foot with the installed seat and note which end is loose. Fuji’s DPS drawings distinguish the screw hood and the separate locknut on some models. Identify the hardware on your seat before expecting it to work like another model."
            }
          ]
        },
        {
          "heading": "Hand the observation to the builder",
          "blocks": [
            {
              "type": "p",
              "text": "For example, report whether the rear hood lost its position, or whether both hoods stayed with the reel while the seat body moved. Add the reel model and a photo of the assembled fit. That helps the builder assess the relevant interface rather than treating every movement as a loose nut."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-my-rod-cast-poorly-despite-premium-components",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why premium rod components can still cast poorly",
      "summary": "Diagnose the reel, line, lure and guide train as a system by isolating the symptom before replacing an expensive component.",
      "aliases": [
        "Why does my rod cast poorly despite premium components?",
        "my rod cast poorly despite premium components",
        "my fishing rod cast poorly despite premium components"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "Shimano, Curado DC 150A (https://fish.shimano.com/en-US/product/reels/baitcast/a075f00004dfpuqat.html) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-do-i-check-casting-performance-after-a-build",
        "what-causes-line-slap-during-a-cast",
        "why-does-my-rod-feel-tip-heavy",
        "why-do-guides-crack-or-lose-inserts"
      ],
      "sections": [
        {
          "heading": "Describe when performance breaks down",
          "blocks": [
            {
              "type": "p",
              "text": "A spool overrun at release, a leader knot catching at the tip, and casts that fall short with a particular lure are different symptoms. Note which one repeats, with the reel, line, lure and conditions beside it. That makes a comparison more useful than a list of component prices."
            }
          ]
        },
        {
          "heading": "Start with a known setup",
          "blocks": [
            {
              "type": "p",
              "text": "Check the reel and line against their makers’ instructions. For example, Shimano’s Curado DC documentation distinguishes braking modes for different conditions and line types. Use the guidance for your reel and keep its settings fixed when comparing guide behaviour."
            }
          ]
        },
        {
          "heading": "Compare the installed layout with the design",
          "blocks": [
            {
              "type": "p",
              "text": "Check the actual guide heights and positions against the intended layout and note whether a specific opening or span is involved. Fuji distinguishes the line path for casting and spinning systems and treats the chart as a starting point. Evaluate the layout issue before substituting another guide with the same nominal size."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-approach-guide-spacing-for-a-multi-piece-surf-rod",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Laying out guides on a multi-piece surf rod",
      "summary": "Plot the actual joint positions and reel reference before adapting a surf guide chart to the assembled blank.",
      "aliases": [
        "How do I approach guide spacing for a multi-piece surf rod?",
        "approach guide spacing for a multi-piece surf rod",
        "How to approach guide spacing for a multi-piece surf rod"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "St. Croix Rod, Seage specifications (https://stcroixrods.com/collections/surf/products/seage-surf) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-do-i-determine-guide-spacing-on-a-spinning-rod",
        "how-should-i-measure-guide-positions",
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots"
      ],
      "sections": [
        {
          "heading": "Mark the joints on the same drawing",
          "blocks": [
            {
              "type": "p",
              "text": "Lay out the rod in its assembled configuration and mark where each section meets the next. Use one distance reference for the joint marks and guide stations. St. Croix’s Seage model table illustrates why the model matters: rods with the same overall length and piece count can have different section splits."
            }
          ]
        },
        {
          "heading": "Overlay a matching starting layout",
          "blocks": [
            {
              "type": "p",
              "text": "Choose a guide reference for the reel type and rod family, then draw the guide feet as well as the ring positions near each joint. A ring centre can appear clear on a chart while the footprint of your selected frame reaches the joint area. Check where the pieces separate before keeping that station."
            }
          ]
        },
        {
          "heading": "Keep track of the neighbouring stations",
          "blocks": [
            {
              "type": "p",
              "text": "If a frame and joint compete for space, identify the affected guide and review its neighbouring gaps and ring positions as a group. Record the position you actually settled on against the assembled blank. That makes the chart usable when a section is replaced or a guide is reordered."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-compare-fast-and-moderate-action-blanks",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Comparing fast and moderate rod blanks",
      "summary": "Compare blanks close in length and power, then choose the bend profile that suits the presentation and how the angler works the lure.",
      "aliases": [
        "How do I compare fast and moderate action blanks?",
        "compare fast and moderate action blanks",
        "How to compare fast and moderate action blanks"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/) | Shimano Canada, Shimano FAQ: Rod Action (https://fishshopcanada.shimano.com/pages/shimano-faq)",
      "related": [
        "what-is-the-difference-between-rod-power-and-action",
        "what-does-blank-recovery-speed-mean",
        "how-do-i-choose-a-rod-blank-for-a-particular-lure"
      ],
      "sections": [
        {
          "heading": "Make the comparison fair",
          "blocks": [
            {
              "type": "p",
              "text": "Start with two blanks close in length, power and lure range. Record the model numbers and ratings in separate columns. If one candidate is also substantially more powerful, any difference the angler notices cannot be described as an action difference alone."
            }
          ]
        },
        {
          "heading": "Ask what the angler wants to feel",
          "blocks": [
            {
              "type": "p",
              "text": "A fast action generally concentrates flex farther toward the tip. A moderate action brings more of the blank into the bend. If the angler wants a defined tip response when working a lure, compare that feel with the longer bend they might prefer when winding a moving bait. Those are preferences to evaluate with the intended technique."
            }
          ]
        },
        {
          "heading": "Record the choice in fishing terms",
          "blocks": [
            {
              "type": "p",
              "text": "Write the reason for choosing the model beside its action label. For instance, note whether the builder wanted flex concentrated nearer the tip or distributed farther down the blank. A replacement with the same action label can still have a different length or power."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-decide-whether-a-blank-suits-braid",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Checking whether a rod blank suits braid",
      "summary": "Start with the maker’s line rating for the exact blank and compare the braid, leader and reel as a complete outfit.",
      "aliases": [
        "How do I decide whether a blank suits braid?",
        "decide whether a blank suits braid",
        "How to decide whether a blank suits braid"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "Lamiglas, Rod Education (https://www.lamiglas.com/pages/rod-education) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "how-does-line-diameter-affect-a-guide-train",
        "how-do-i-choose-a-rod-blank-for-a-particular-lure",
        "what-is-the-difference-between-rod-power-and-action"
      ],
      "sections": [
        {
          "heading": "Read how the rating was expressed",
          "blocks": [
            {
              "type": "p",
              "text": "Find the exact blank model and ask whether its line range is given for mono, braid or a named application. Lamiglas explains its mono-based rating convention and why line diameter and breaking strength are different comparisons. Keep that interpretation attached to the maker instead of adopting it for every rod."
            }
          ]
        },
        {
          "heading": "Record the outfit before committing",
          "blocks": [
            {
              "type": "p",
              "text": "Write the braid’s stated diameter and strength beside the leader and reel. For example, two braids with a similar stated strength can have different published diameters. If you intend to change line type on a customer’s outfit, ask the blank maker how its rating applies to the proposed combination."
            }
          ]
        },
        {
          "heading": "Keep guide fit as a separate check",
          "blocks": [
            {
              "type": "p",
              "text": "Check the proposed guide layout for the line arrangement you will actually use. On a spinning setup, the reduction layout deals with line leaving the spool. The running guides and top also have to accommodate the leader connection if it passes through them. Record those requirements separately from the blank’s rating."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-inspect-a-new-blank-before-building",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Inspecting a new fishing rod blank at intake",
      "summary": "Confirm the blank against its model specifications and document any visible discrepancy before fitting custom components.",
      "aliases": [
        "How do I inspect a new blank before building?",
        "inspect a new blank before building",
        "How to inspect a new blank before building"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/) | CTS Fishing, Rod Repairs & Warranty Support (https://ctsfishing.com/repairs/)",
      "related": [
        "how-do-i-measure-a-blank-s-diameter-accurately",
        "what-should-be-included-in-a-rod-specification-sheet",
        "how-do-i-choose-a-rod-blank-for-a-particular-lure",
        "what-is-the-difference-between-rod-power-and-action"
      ],
      "sections": [
        {
          "heading": "Match what arrived to the order",
          "blocks": [
            {
              "type": "p",
              "text": "Read the model label, count the sections and compare the supplied blank with the maker’s specifications. Keep model, length, butt dimension and tip designation separate. If a dimension differs, confirm the units and where it was taken before asking the supplier to identify the blank."
            }
          ]
        },
        {
          "heading": "Create a visual record before assembly",
          "blocks": [
            {
              "type": "p",
              "text": "Look over each section in good light and keep separate notes for the surface, ends and joint areas. Photograph an apparent discrepancy with a label or named end in view. Describe what you can see, for example a mark beside the joint, without claiming you know its cause from appearance alone."
            }
          ]
        },
        {
          "heading": "Keep any supplier decision with the job",
          "blocks": [
            {
              "type": "p",
              "text": "If there is a question about the identity or condition, send the model number, photos and measurement reference to the supplier. Keep the response with the build record before fitting custom parts. CTS, for instance, addresses material and workmanship defects separately from modification in its service guidance."
            }
          ]
        }
      ]
    },
    {
      "id": "should-guides-follow-the-blank-s-spine",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Do rod guides need to follow the blank spine?",
      "summary": "Treat the blank’s preferred flex orientation and visible straightness as separate observations when selecting a guide reference.",
      "aliases": [
        "Should guides follow the blank's spine?"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "Tom Kirkman, RodMaker Magazine, Rod Spine (https://www.rodmakermagazine.com/wp-content/uploads/2024/05/rodspine.pdf) | OpenStax, University Physics Volume 1, 10.6 Torque (https://openstax.org/books/university-physics-volume-1/pages/10-6-torque)",
      "related": [
        "can-spiral-wrapping-reduce-rod-twist-under-load",
        "how-do-i-check-whether-a-guide-train-is-aligned",
        "how-do-i-choose-a-rod-blank-for-a-particular-lure",
        "what-is-the-difference-between-rod-power-and-action"
      ],
      "sections": [
        {
          "heading": "Separate the two observations",
          "blocks": [
            {
              "type": "p",
              "text": "RodMaker author Tom Kirkman uses spine for a preferred flex orientation of a rolled blank. The axis you see as straightest when sighting down the blank can be different. A mark for one observation does not tell you where the other lies."
            }
          ]
        },
        {
          "heading": "Choose a guide reference you can reproduce",
          "blocks": [
            {
              "type": "p",
              "text": "Follow any model-specific instruction first. When comparing possible orientations, note which makes the tip and handle line up visually in the intended fishing position. Record the reference you chose so the seat and guide layout can be checked from the same view."
            }
          ]
        },
        {
          "heading": "Keep rotational behaviour in context",
          "blocks": [
            {
              "type": "p",
              "text": "A preferred orientation observed on the bare blank is different from the moment that line force can produce through a guide at an offset from the rod axis. Kirkman discusses these as separate effects. Use the guide layout and reel orientation when reviewing line-induced roll."
            }
          ]
        }
      ]
    },
    {
      "id": "what-does-blank-recovery-speed-mean",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What rod blank recovery speed describes",
      "summary": "Recovery describes how a blank settles after it has been deflected. Keep it separate from the action label and the finished rod’s balance.",
      "aliases": [
        "What does blank recovery speed mean?",
        "blank recovery speed mean"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "Scott Fly Rod Company, G Series manufacturer brochure (https://www.madriveroutfitters.com/images/productfiles/14061/2018GSeriesScott.pdf) | Lamiglas, Rod Education (https://www.lamiglas.com/pages/rod-education)",
      "related": [
        "how-do-i-compare-fast-and-moderate-action-blanks",
        "how-do-i-compare-guide-sets-by-total-weight",
        "how-do-i-choose-a-rod-blank-for-a-particular-lure",
        "what-is-the-difference-between-rod-power-and-action"
      ],
      "sections": [
        {
          "heading": "Describe the motion you see",
          "blocks": [
            {
              "type": "p",
              "text": "After the blank unloads, its tip can continue to move before settling. Recovery is about that response over time. The action label describes how the rod bends. Scott’s ReAct explanation treats residual vibration and recovery as design considerations alongside stiffness."
            }
          ]
        },
        {
          "heading": "Compare the same state of assembly",
          "blocks": [
            {
              "type": "p",
              "text": "When comparing descriptions, check what was assessed: a bare blank or a finished rod. Record the guide set and other fitted parts when taking workshop notes. If one rod is bare and the other is finished, label that difference before attributing what you see to the blank design."
            }
          ]
        },
        {
          "heading": "Use a specific note instead of a rating",
          "blocks": [
            {
              "type": "p",
              "text": "Write down whether you mean the initial return toward straight or the movement that continues afterwards. If a manufacturer does not publish a measurement method, keep your observation as a qualitative comparison and avoid assigning a time or performance ranking from the action label."
            }
          ]
        }
      ]
    },
    {
      "id": "can-spiral-wrapping-reduce-rod-twist-under-load",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "How spiral wrapping changes rod twist",
      "summary": "Moving the working guides beneath a casting rod changes the leverage of line force around the blank and can reduce its tendency to roll.",
      "aliases": [
        "Can spiral wrapping reduce rod twist under load?",
        "can spiral wrapping reduce fishing rod twist under load"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "OpenStax, University Physics Volume 1, 10.6 Torque (https://openstax.org/books/university-physics-volume-1/pages/10-6-torque) | Tom Kirkman, RodMaker Magazine, Rod Spine (https://www.rodmakermagazine.com/wp-content/uploads/2024/05/rodspine.pdf)",
      "related": [
        "what-is-a-spiral-wrapped-casting-rod",
        "how-do-i-choose-left-or-right-spiral-orientation"
      ],
      "sections": [
        {
          "heading": "Look at the force across the blank",
          "blocks": [
            {
              "type": "p",
              "text": "Look along the blank from the butt. In that end-on view, the line’s pull on a guide twists the blank if the projected line of action misses the centre of the blank. If the projected force points through the centre, it produces no twisting moment about that axis. Moving the guide around the blank can change the size or direction of the moment."
            }
          ]
        },
        {
          "heading": "Compare the upper and lower positions",
          "blocks": [
            {
              "type": "p",
              "text": "With the working guides above the blank, a sideways displacement can let the line pull the rod farther from its upright position. An underside running train is closer to alignment with a downward pull in the usual fishing orientation. That is the mechanical reason to consider a spiral, rather than an assumption about blank spine."
            }
          ]
        },
        {
          "heading": "Account for the whole layout",
          "blocks": [
            {
              "type": "p",
              "text": "The result depends on where the force acts, the direction of pull and the guide geometry. The first guide and any side guides still contribute their own forces. A spiral layout does not make every possible line pull pass through the blank axis."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-choose-left-or-right-spiral-orientation",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing a left or right spiral guide layout",
      "summary": "Choose the transition side for the reel, holder and handling arrangement, and put the viewing direction on the drawing.",
      "aliases": [
        "How do I choose left or right spiral orientation?",
        "choose left or right spiral orientation",
        "How to choose left or right spiral orientation"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "K-Labs Studio, Guide Setup implementation (K-Labs Studio source dfa17b0: js/ui.js:1093,1190,1340,1359 and README.md:55) | Tom Kirkman, RodMaker Magazine, Simple Spiral Revisited (https://www.rodmakermagazine.com/wp-content/uploads/2025/06/simplespiral.pdf)",
      "related": [
        "what-is-a-spiral-wrapped-casting-rod",
        "how-should-i-number-guides-in-a-spiral-layout",
        "what-is-an-offset-stripper-guide"
      ],
      "sections": [
        {
          "heading": "Define left from a fixed viewpoint",
          "blocks": [
            {
              "type": "p",
              "text": "Use a named viewing direction, such as looking from the butt toward the tip. Mark the top of the reel seat as the common reference. That way a side written on a bench sketch means the same thing when the rod is turned around."
            }
          ]
        },
        {
          "heading": "Look at the rod in its normal resting position",
          "blocks": [
            {
              "type": "p",
              "text": "With the intended reel fitted, compare the side clearances in the holder or rack the angler uses. Kirkman gives an example in which a side guide is placed with deck storage in mind. Treat reel-handle position and storage clearance as inputs for the particular build."
            }
          ]
        },
        {
          "heading": "Write down the reason for the choice",
          "blocks": [
            {
              "type": "p",
              "text": "If either side will accommodate the planned route around the blank, record which side was selected and why. Another angler with a different holder or reel can then see whether to keep your orientation or mirror the drawing."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-determine-guide-spacing-on-a-casting-rod",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Planning guide spacing on a level-wind casting rod",
      "summary": "Use the fitted casting reel and its level-wind entry path to choose a starting layout, then record each guide’s station and role.",
      "aliases": [
        "How do I determine guide spacing on a casting rod?",
        "determine guide spacing on a casting rod",
        "How to determine guide spacing on a casting rod"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-do-i-determine-guide-spacing-on-a-spinning-rod",
        "how-should-i-measure-guide-positions",
        "where-should-the-stripper-guide-sit-on-a-spinning-rod"
      ],
      "sections": [
        {
          "heading": "Fit the reel before copying a chart",
          "blocks": [
            {
              "type": "p",
              "text": "Mark the reel-seat position and identify the line exit from the intended reel. Fuji’s baitcasting documentation uses the level wind as an entry reference. Use the casting section for this setup, since a fixed-spool spinning layout starts from a different line path."
            }
          ]
        },
        {
          "heading": "Draw the height changes as well as the gaps",
          "blocks": [
            {
              "type": "p",
              "text": "Place each candidate guide on the bench plan with its ring height and distance from your chosen reference. Inspect the path through the first group from the fitted reel. If a frame substitution changes the height, review the adjacent positions before treating an old spacing figure as settled."
            }
          ]
        },
        {
          "heading": "Document the starting layout clearly",
          "blocks": [
            {
              "type": "p",
              "text": "Record whether the plan is guides-on-top or spiral and list the tip top separately from numbered guides if that is your convention. Mark which figures came from the reference and which describe your own temporary layout, so later verification can be traced to the actual build."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-determine-guide-spacing-on-a-spinning-rod",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Planning a spinning rod’s guide spacing",
      "summary": "Start from the spool and reduction system, then lay out the transition and running section as separate parts of the same guide train.",
      "aliases": [
        "How do I determine guide spacing on a spinning rod?",
        "determine guide spacing on a spinning rod",
        "How to determine guide spacing on a spinning rod"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | K-Labs Studio, Guide Setup implementation (K-Labs Studio source dfa17b0: js/ui.js:1093,1190,1340,1359 and README.md:55)",
      "related": [
        "how-do-i-determine-guide-spacing-on-a-casting-rod",
        "what-is-the-kr-concept-guide-system",
        "where-should-the-stripper-guide-sit-on-a-spinning-rod"
      ],
      "sections": [
        {
          "heading": "Select the right spinning reference",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the intended reel and record the spool reference. Fuji’s published guide notes describe different layouts for its New Guide Concept and KR Concept. Use the system that matches the guide family and reel arrangement you are planning rather than mixing positions from different charts."
            }
          ]
        },
        {
          "heading": "Lay out the whole reduction group",
          "blocks": [
            {
              "type": "p",
              "text": "Set the first guide and transition on the sketch, then compare the positions and heights between them. If the entry guide changes, check the view from the spool through the intermediate rings again. A spacing list without the intended guide models leaves out the frame heights that shape the path."
            }
          ]
        },
        {
          "heading": "Record the running section independently",
          "blocks": [
            {
              "type": "p",
              "text": "Keep the transition and the low runners identified on the build drawing. Record their stations from one named reference and update the drawing when a guide moves. Studio’s Guide Setup distinguishes guide positions from the gaps between adjacent guides."
            }
          ]
        }
      ]
    },
    {
      "id": "what-guides-work-for-a-spiral-wrapped-rod",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing guide frames for a spiral-wrapped rod",
      "summary": "Select guide frames by their job at the reel entry, around the blank and along the underside running section.",
      "aliases": [
        "What guides work for a spiral-wrapped rod?"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | Ralph O’Quinn, RodMaker Magazine, Spiral Wrap for Casting Rods (https://www.u-40.com/Userfiles/PDF-Articles/RodMaker/Finishing%20tips.pdf) | Tom Kirkman, RodMaker Magazine, Simple Spiral Revisited (https://www.rodmakermagazine.com/wp-content/uploads/2025/06/simplespiral.pdf)",
      "related": [
        "what-is-a-spiral-wrapped-casting-rod",
        "what-is-an-offset-stripper-guide",
        "how-do-i-choose-left-or-right-spiral-orientation"
      ],
      "sections": [
        {
          "heading": "Choose the entry frame for the fitted reel",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the guide near the reel with the line exit and proposed route into the wrap. Write down the frame, height and clear opening. A familiar ring number alone does not tell you where the centre of that opening will sit."
            }
          ]
        },
        {
          "heading": "Specify a side guide by its purpose",
          "blocks": [
            {
              "type": "p",
              "text": "Some spiral designs place guides around the side as part of a gradual transition. Kirkman’s Simple Spiral uses a different division of jobs: its optional low side guide exists to keep line off the blank. Identify which design you are building before selecting that piece."
            }
          ]
        },
        {
          "heading": "Plan the underside parts as a group",
          "blocks": [
            {
              "type": "p",
              "text": "List the running guides and top, and compare the openings to the actual rig. In Kirkman’s method the underside runners are matched in size. Record that as a choice for that particular method rather than borrowing only one piece of the design for an otherwise different layout."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-a-spiral-wrapped-casting-rod",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What a spiral-wrapped casting rod is",
      "summary": "The reel stays above the blank while the line path moves around it and continues through guides underneath toward the tip.",
      "aliases": [
        "What is a spiral-wrapped casting rod?",
        "a spiral-wrapped casting rod"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "Ralph O’Quinn, RodMaker Magazine, Spiral Wrap for Casting Rods (https://www.u-40.com/Userfiles/PDF-Articles/RodMaker/Finishing%20tips.pdf) | Tom Kirkman, RodMaker Magazine, Simple Spiral Revisited (https://www.rodmakermagazine.com/wp-content/uploads/2025/06/simplespiral.pdf) | K-Labs Studio, Guide Setup implementation (K-Labs Studio source dfa17b0: js/ui.js:1093,1190,1340,1359 and README.md:55)",
      "related": [
        "can-spiral-wrapping-reduce-rod-twist-under-load",
        "what-guides-work-for-a-spiral-wrapped-rod",
        "how-do-i-choose-left-or-right-spiral-orientation",
        "what-is-an-offset-stripper-guide"
      ],
      "sections": [
        {
          "heading": "Follow the line from reel to tip",
          "blocks": [
            {
              "type": "p",
              "text": "Start with the rod held reel up. Near the handle the line leaves the reel above the blank, then moves around the side and reaches runners underneath. The name describes the route of the line and guide orientations, rather than the pattern of thread around a guide foot."
            }
          ]
        },
        {
          "heading": "Recognise two layout styles",
          "blocks": [
            {
              "type": "p",
              "text": "A gradual spiral may use several rotated guides between top and bottom. In Kirkman’s Simple Spiral, the entry guide remains on top and most of the train lies underneath, with a side guide available for clearance. Both look different from an inline guides-on-top casting layout."
            }
          ]
        },
        {
          "heading": "Read each guide’s two coordinates",
          "blocks": [
            {
              "type": "p",
              "text": "On a spiral drawing, look for where each guide sits along the rod and how it is rotated around the blank. A guide can occupy the same station as on an inline rod and still point in a different direction. Keep position and rotation separate when reading or describing the build."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-an-offset-stripper-guide",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What an offset stripper guide does",
      "summary": "An offset stripper is the first guide rotated away from the reel-up reference. Its position and the line approach must be considered together.",
      "aliases": [
        "What is an offset stripper guide?",
        "an offset stripper guide"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "Karl Sandborg, Guide spacing and placement patent application US20050034352A1 (https://patents.google.com/patent/US20050034352A1/en) | Tom Kirkman, RodMaker Magazine, Simple Spiral Revisited (https://www.rodmakermagazine.com/wp-content/uploads/2025/06/simplespiral.pdf) | K-Labs Studio, Guide Setup implementation (K-Labs Studio source dfa17b0: js/ui.js:1093,1190,1340,1359 and README.md:55)",
      "related": [
        "what-guides-work-for-a-spiral-wrapped-rod",
        "how-do-i-choose-left-or-right-spiral-orientation",
        "what-is-a-spiral-wrapped-casting-rod"
      ],
      "sections": [
        {
          "heading": "Identify which guide is offset",
          "blocks": [
            {
              "type": "p",
              "text": "The stripper is the first guide after the reel. In some spiral designs this guide is rotated around the blank, so its ring centre sits away from the reel-up line. A small side guide farther along the train is another component. Check the drawing before calling both guides a stripper."
            }
          ]
        },
        {
          "heading": "Draw the approach from the reel",
          "blocks": [
            {
              "type": "p",
              "text": "Record the angle of the first guide as well as its distance from the line exit. Inspect the path from the fitted reel to that guide and into the next one. Moving the first ring around the blank changes the approach from the reel, so compare the path with the reel you intend to use."
            }
          ]
        },
        {
          "heading": "Keep the model choice explicit",
          "blocks": [
            {
              "type": "p",
              "text": "Kirkman’s Simple Spiral keeps the first guide on top, while the published offset example uses a rotated first guide. If you are following someone else’s layout, record which arrangement you copied and distinguish its entry-guide angle from any general rotation labels in your bench notes."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-my-rod-feel-tip-heavy",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Why a fishing rod feels tip-heavy",
      "summary": "Tip heaviness is the turning effect of the outfit’s weight ahead of the hand. Compare balance in the position the angler actually uses.",
      "aliases": [
        "Why does my rod feel tip-heavy?",
        "my rod feel tip-heavy",
        "my fishing rod feel tip-heavy"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "OpenStax, University Physics Volume 1, 10.6 Torque (https://openstax.org/books/university-physics-volume-1/pages/10-6-torque)",
      "related": [
        "how-do-i-check-rod-balance-before-bonding-grips",
        "why-does-my-rod-s-handle-feel-uncomfortable"
      ],
      "sections": [
        {
          "heading": "Look at the leverage around the hand",
          "blocks": [
            {
              "type": "p",
              "text": "When a rod is held roughly horizontal, weight ahead of the grip creates a tip-down moment. The same weight produces more turning effect when its vertical line of action is farther horizontally from the hand. The balance of the assembled outfit depends on contributions from both sides of that point."
            }
          ]
        },
        {
          "heading": "Change one thing during the comparison",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the usual reel and hold the rod where you fish it. Compare a different grip position or reel one at a time. If the feel changes when the hand moves, you have changed the reference point. That observation helps narrow the question before reshaping a handle or changing guides."
            }
          ]
        },
        {
          "heading": "Keep balance and total weight in view",
          "blocks": [
            {
              "type": "p",
              "text": "A heavier reel or a rearward addition can shift the balance, depending on its location relative to the hand. It also adds overall weight. Compare both the tip-down feel and the heft of the whole outfit when deciding which result suits the intended use."
            }
          ]
        }
      ]
    },
    {
      "id": "why-does-my-rod-s-handle-feel-uncomfortable",
      "category": "troubleshooting",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Diagnosing an uncomfortable fishing rod handle",
      "summary": "Identify where the handle interferes with your usual grip or stroke, then compare the relevant dimension with a comfortable rod.",
      "aliases": [
        "Why does my rod's handle feel uncomfortable?",
        "my rod's handle feel uncomfortable"
      ],
      "tags": [
        "troubleshooting",
        "performance"
      ],
      "source": "St. Croix Rod, Mojo Musky model specifications (https://stcroixrods.com/collections/musky-pike/products/mojo-musky)",
      "related": [
        "why-does-my-rod-feel-tip-heavy",
        "how-do-i-measure-reel-seat-position"
      ],
      "sections": [
        {
          "heading": "Name the exact contact",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the reel you normally use and reproduce the troublesome hold. A trigger pressing a finger, a hood under the palm and a butt that catches your sleeve are different fit problems. Write down where it happens and whether it appears during the retrieve, the lure stroke or a two-handed hold."
            }
          ]
        },
        {
          "heading": "Compare one feature at a time",
          "blocks": [
            {
              "type": "p",
              "text": "Choose a rod that feels comfortable for the same job. Measure its butt-to-seat distance and note the grip shape and hand position. If the problem is local pressure at the reel, compare the seat and shoulder shape before assuming the whole handle needs to be shorter."
            }
          ]
        },
        {
          "heading": "Give the builder a useful brief",
          "blocks": [
            {
              "type": "p",
              "text": "Describe the position and motion you want to preserve. For example, say that the butt runs into your forearm during a tip-down stroke while the front grip feels right. The builder can then dry fit a different rear length and keep the successful part of the handle as the reference."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-check-rod-balance-before-bonding-grips",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Checking rod balance during a handle dry fit",
      "summary": "Compare handle positions with the intended reel fitted and the grip and butt pieces in place before committing to the layout.",
      "aliases": [
        "How do I check rod balance before bonding grips?",
        "check rod balance before bonding grips",
        "check fishing rod balance before bonding grips",
        "How to check rod balance before bonding grips"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | OpenStax, University Physics §10.6 Torque (https://openstax.org/books/university-physics-volume-1/pages/10-6-torque) | Fuji Kogyo, BRC and BRC-GC butt caps (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/10/2022_BRC_BRC-GC.pdf)",
      "related": [
        "how-do-i-measure-reel-seat-position",
        "how-do-i-choose-the-correct-reel-seat-size",
        "should-i-use-an-exposed-blank-reel-seat"
      ],
      "sections": [
        {
          "heading": "Assemble the parts you are comparing",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the intended reel and temporarily assemble the seat and handle. Compare the positions you would actually fish. An unfinished mock-up gives a preliminary comparison, so record any parts that are still missing."
            }
          ]
        },
        {
          "heading": "Compare from the fishing grip",
          "blocks": [
            {
              "type": "p",
              "text": "When comparing seat positions, use the same reel and hold the outfit from the same point on the proposed grip. Note whether the tip still wants to fall. Changing your grip point changes the leverage of the rest of the outfit."
            }
          ]
        },
        {
          "heading": "Keep the preferred setting",
          "blocks": [
            {
              "type": "p",
              "text": "Record the butt-to-seat dimension, the hand position and the fitted parts. If the reel or butt hardware changes later, repeat the comparison with the new part before using the old measurements as the final layout."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-choose-a-butt-cap",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing a butt cap for a custom fishing rod",
      "summary": "Match the cap to its mating surface and grip profile, then dry fit it to confirm the finished butt length and transition.",
      "aliases": [
        "How do I choose a butt cap?",
        "choose a butt cap",
        "How to choose a butt cap"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, BRC and BRC-GC butt caps (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/10/2022_BRC_BRC-GC.pdf) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | K-Labs, Studio Build Details and Guide Setup (K-Labs Studio: index.html:719,987; js/ui.js:17105)",
      "related": [
        "how-do-i-check-rod-balance-before-bonding-grips",
        "how-do-i-plan-a-split-grip-layout",
        "how-do-i-measure-reel-seat-position"
      ],
      "sections": [
        {
          "heading": "Check the type of fit",
          "blocks": [
            {
              "type": "p",
              "text": "Find the mating surface, then compare its outside diameter with the bore of a cap that fits over it. Fuji’s BRC sheet lists the bore, outside profile and length separately."
            }
          ]
        },
        {
          "heading": "Compare the assembled profile",
          "blocks": [
            {
              "type": "p",
              "text": "Place the proposed cap against the rear grip in a dry fit. Look at the seam and feel the change in diameter where the parts meet. Two caps can fit a similar mating surface and still leave a different outline or finished handle length."
            }
          ]
        },
        {
          "heading": "Use the finished butt as your reference",
          "blocks": [
            {
              "type": "p",
              "text": "If you swap to a longer cap, recheck the distance from its finished end to the seat. Record the exact part number and material with the revised handle dimension so the same cap can be ordered again."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-select-a-hook-keeper",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing a hook keeper for a fishing rod",
      "summary": "Select a keeper that suits the rig and folds or sits where it clears the angler’s hand and the rest of the handle.",
      "aliases": [
        "How do I select a hook keeper?",
        "select a hook keeper",
        "How to select a hook keeper"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, MHKM multi hook keeper (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_MHKM.pdf) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-do-i-choose-a-butt-cap",
        "how-do-i-choose-guide-ring-material",
        "what-is-the-difference-between-single-foot-and-double-foot-guides",
        "how-do-i-select-a-tip-top-guide"
      ],
      "sections": [
        {
          "heading": "Match the keeper to the rig",
          "blocks": [
            {
              "type": "p",
              "text": "Choose a keeper for the rig you want it to hold. For example, Fuji’s MHKM is an open-hook design with a retaining body. Its drawing also lists the range of rod diameters for each mounting ring."
            }
          ]
        },
        {
          "heading": "Check the handle with the hardware in place",
          "blocks": [
            {
              "type": "p",
              "text": "With the reel in place, check the keeper footprint where you plan to put it. For a ring-mounted keeper, measure the blank at that location, then check the maker’s fit range and clearance around your usual grip."
            }
          ]
        },
        {
          "heading": "Record the keeper separately",
          "blocks": [
            {
              "type": "p",
              "text": "Record the keeper model and its position separately from the line guides. Check the instructions for its mounting style before planning any wrap around it."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-store-spare-rod-building-components",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Organising spare rod-building components",
      "summary": "Store loose parts under their model and dimensions so an exact replacement can be identified when a job returns to the bench.",
      "aliases": [
        "How should I store spare rod-building components?",
        "store spare rod-building components",
        "How to store spare rod-building components"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, LG stainless tip-top specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_LG_stain.pdf) | ProProducts, ProWrap ColorFast thread product table (https://proproducts.us/products/prowrap-colorfast-rod-winding-thread-size-a-650-yds)",
      "related": [
        "what-tools-are-essential-for-a-beginner-rod-builder",
        "how-do-i-choose-guide-ring-material",
        "what-is-the-difference-between-single-foot-and-double-foot-guides",
        "how-do-i-select-a-tip-top-guide"
      ],
      "sections": [
        {
          "heading": "Keep the useful label with the part",
          "blocks": [
            {
              "type": "p",
              "text": "Use labelled compartments for each exact guide model and size. For a tip top, keep both its ring designation and tube size. A loose top that looks right from above can have a different tube, so avoid relying on appearance when returning it to stock."
            }
          ]
        },
        {
          "heading": "Store the comparison details",
          "blocks": [
            {
              "type": "p",
              "text": "Keep thread family, colour code and size with the spool, even when several products share a colour name. For handle components, keep the supplier code and fit dimension with the part. Use the same fields on the build sheet so inventory and the installed part can be matched."
            }
          ]
        },
        {
          "heading": "Separate leftovers from job stock",
          "blocks": [
            {
              "type": "p",
              "text": "When a job is done, check the component list before returning unused parts. Put an unidentified spare in its own compartment until measured and identified. That preserves the meaning of the bin labels for the next order."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-inspect-a-custom-rod-before-a-fishing-trip",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Inspecting a custom rod before a fishing trip",
      "summary": "Look over the blank, guides, ferrules and handle before packing, and note exactly where any change from the last trip appears.",
      "aliases": [
        "How do I inspect a custom rod before a fishing trip?",
        "inspect a custom rod before a fishing trip",
        "inspect a custom fishing rod before a fishing trip",
        "How to inspect a custom rod before a fishing trip"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "Orvis, Extending the Life of Your Fly Fishing Equipment (https://www.orvis.co.uk/blogs/explore-orvis/fly-fishing-gear-maintenance-extending-the-life-of-your-equipment) | ONE&ONE, Pack Rod Product Care (https://www.oneandonefishing.com/pages/pack-rod-product-care)",
      "related": [
        "what-maintenance-should-customers-perform-on-custom-rods",
        "how-should-i-clean-saltwater-fishing-rods",
        "how-should-i-store-multi-piece-rods",
        "what-tools-are-essential-for-a-beginner-rod-builder"
      ],
      "sections": [
        {
          "heading": "Start with the sections out of the sleeve",
          "blocks": [
            {
              "type": "p",
              "text": "Lay out the sections in order and inspect the blank and the outside of the joints. Work along the guide train in sequence. Examine the ring and frame under good light, then check that all the sections and any removable handle parts are accounted for."
            }
          ]
        },
        {
          "heading": "Record anything that has changed",
          "blocks": [
            {
              "type": "p",
              "text": "If a mark remains after cleaning, describe its position and take a photo. For example, note whether the mark is in the ring, on the frame, or on the wrap beside the foot. A close-up and a wider photo make it easier for a builder to identify the component."
            }
          ]
        },
        {
          "heading": "Make the check repeatable",
          "blocks": [
            {
              "type": "p",
              "text": "Use the same inspection order next time. Keep a note of items sent for inspection with the rod and the date, so a later bench visit starts with a useful description of when the change was first seen."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-organise-a-rod-building-bench",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Organising a rod-building workbench",
      "summary": "Set up a clear rod path with movable supports, useful sighting light and separate places for parts and measurements.",
      "aliases": [
        "How should I organise a rod-building bench?",
        "organise a rod-building bench",
        "How to organise a rod-building bench"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "CRB, HWS-1 Hand Wrapping System manufacturer instruction sheet (https://blog.mudhole.com/wp-content/uploads/2015/03/CRB-Hand-Wrapping-System.pdf) | Fuji Kogyo, Hand rod wrapper specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_rodbuilding_03.pdf) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "what-tools-are-essential-for-a-beginner-rod-builder",
        "how-do-i-check-whether-a-guide-train-is-aligned",
        "how-should-i-clean-saltwater-fishing-rods",
        "how-do-i-inspect-a-custom-rod-before-a-fishing-trip"
      ],
      "sections": [
        {
          "heading": "Give the rod an uninterrupted path",
          "blocks": [
            {
              "type": "p",
              "text": "Set the hand wrapper where you can move its supports as you work along the blank. The CRB system provides an extra stand for the tip or butt. Dry-fit the longest job you expect to handle and check where each support can sit without crowding the working area."
            }
          ]
        },
        {
          "heading": "Keep the thread path clear",
          "blocks": [
            {
              "type": "p",
              "text": "Put the thread stand where it can feed through its tensioner without crossing the blank’s working area. Fuji’s hand-wrapper drawing identifies the thread stand and tensioner as part of that setup. Check that the rod and supports can move independently of the thread stand."
            }
          ]
        },
        {
          "heading": "Give parts and notes fixed places",
          "blocks": [
            {
              "type": "p",
              "text": "Lay guides in installation order in a tray beside the station, with tip top and trim pieces labelled separately. Keep the sketch or build sheet visible so you can compare the laid-out pieces and measurements without moving the blank off its supports."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-test-a-completed-rod-before-delivery",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Checking a completed rod before customer handover",
      "summary": "Compare the finished rod with the agreed build, check visible fit and finish, and document the acceptance checks actually performed.",
      "aliases": [
        "How should I test a completed rod before delivery?",
        "test a completed rod before delivery",
        "test a completed fishing rod before delivery",
        "How to test a completed rod before delivery"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "K-Labs Studio, Build Summary implementation (K-Labs Studio source dfa17b0: js/ui.js:1448,15461,15720 and index.html) | Orvis, Extending the Life of Your Fly Fishing Equipment (https://www.orvis.co.uk/blogs/explore-orvis/fly-fishing-gear-maintenance-extending-the-life-of-your-equipment)",
      "related": [
        "how-do-i-check-whether-a-guide-train-is-aligned",
        "what-should-be-included-in-a-rod-specification-sheet",
        "how-should-i-clean-saltwater-fishing-rods",
        "how-do-i-inspect-a-custom-rod-before-a-fishing-trip"
      ],
      "sections": [
        {
          "heading": "Check the finished rod against the record",
          "blocks": [
            {
              "type": "p",
              "text": "Start with the accepted specification, then review any substitutions. Check the rod identification, handle layout and the fitted guide sequence. If a different component was approved during the job, make sure the completed build record names the part actually fitted."
            }
          ]
        },
        {
          "heading": "Review fit and finish on the bench",
          "blocks": [
            {
              "type": "p",
              "text": "Inspect guide alignment and the visible condition of the wraps and finish. Fit the intended reel to check the handle arrangement with the customer’s specification in front of you. Record any outstanding fit or finish issue by position before preparing the handover."
            }
          ]
        },
        {
          "heading": "Keep the handover evidence",
          "blocks": [
            {
              "type": "p",
              "text": "Record the date and which checks were actually performed. List any separate casting or load evaluation by its own name and report a bench inspection as a bench inspection. In Studio, compare the Build Summary with what you intend to hand over."
            }
          ]
        }
      ]
    },
    {
      "id": "what-maintenance-should-customers-perform-on-custom-rods",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "A maintenance routine for custom fishing rods",
      "summary": "Give the owner a short after-trip and seasonal care routine tailored to the rod, its sections and its usual fishing conditions.",
      "aliases": [
        "What maintenance should customers perform on custom rods?"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "Orvis, Extending the Life of Your Fly Fishing Equipment (https://www.orvis.co.uk/blogs/explore-orvis/fly-fishing-gear-maintenance-extending-the-life-of-your-equipment) | ONE&ONE, Pack Rod Product Care (https://www.oneandonefishing.com/pages/pack-rod-product-care)",
      "related": [
        "how-should-i-clean-saltwater-fishing-rods",
        "how-do-i-inspect-a-custom-rod-before-a-fishing-trip",
        "how-should-i-store-multi-piece-rods"
      ],
      "sections": [
        {
          "heading": "Provide a routine with the rod",
          "blocks": [
            {
              "type": "p",
              "text": "Explain where to find the maker’s care directions and which parts of the custom handle or guide train deserve attention. Include rinsing after exposure to salt or grit and drying before the rod goes into its sleeve."
            }
          ]
        },
        {
          "heading": "Add a seasonal check",
          "blocks": [
            {
              "type": "p",
              "text": "At the end of the season, review the rod while it is clean and out of its case. Note changes at the guides, joints or handle, and keep the record with the rod. Make time for a workshop inspection if there are concerns about its condition."
            }
          ]
        },
        {
          "heading": "Keep service details handy",
          "blocks": [
            {
              "type": "p",
              "text": "Record the make, model and sections together with the builder’s contact details. If a guide or other component has been changed, add the replacement model and position to the service note so the next repair can refer back to it."
            }
          ]
        }
      ]
    },
    {
      "id": "what-tools-are-essential-for-a-beginner-rod-builder",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Essential tools for a first fishing rod build",
      "summary": "Start with tools for measuring, dry fitting, supporting the blank and controlling thread, then match finishing supplies to the products you use.",
      "aliases": [
        "What tools are essential for a beginner rod builder?",
        "what tools are essential for a beginner fishing rod builder"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "Fuji Kogyo, LG stainless tip-top specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_LG_stain.pdf) | Flex Coat, Hand Rod Wrapper (HW1) Instructions (https://flexcoat.com/blogs/rod-building-resources/hand-rod-wrapper-hw1-instructions) | Flex Coat, Rod Wrapping Finish Tips (https://flexcoat.com/blogs/using-flex-coat-finish/rod-wrapping-finish-tips)",
      "related": [
        "how-should-i-organise-a-rod-building-bench",
        "how-should-i-clean-saltwater-fishing-rods",
        "how-do-i-inspect-a-custom-rod-before-a-fishing-trip",
        "how-should-i-store-multi-piece-rods"
      ],
      "sections": [
        {
          "heading": "Buy for the job on the bench",
          "blocks": [
            {
              "type": "p",
              "text": "Read the build sheet and list which dimensions you need to check, including fitting sizes for the handle and tip top. Include a suitable measuring rule and caliper. Lay out the component order before buying a second set of specialist tools."
            }
          ]
        },
        {
          "heading": "Set up a controlled hand wrap",
          "blocks": [
            {
              "type": "p",
              "text": "Use supports that hold the blank while leaving the work area clear, a thread holder with controllable tension, and a way to see the guide feet and wraps under useful light. A hand wrapping system combines supports and thread control without requiring a power wrapper."
            }
          ]
        },
        {
          "heading": "Read the product instructions before assembling the kit",
          "blocks": [
            {
              "type": "p",
              "text": "For each adhesive or finish you have already chosen, check its instructions and list the measuring, mixing and application supplies it specifies. A kit of tools and a bottle of finish are separate items unless the packing list says otherwise."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-check-whether-a-guide-train-is-aligned",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Checking rod guide alignment at the bench",
      "summary": "Sight the dry layout against the chosen reference, then repeat after wrapping to see whether any guide has turned.",
      "aliases": [
        "How do I check whether a guide train is aligned?",
        "check whether a guide train is aligned",
        "How to check whether a guide train is aligned"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, SKSS/SKTS skeleton reel seats (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_SKSS_SKTS.pdf) | K-Labs, Studio Build Details and Guide Setup (K-Labs Studio: index.html:719,987; js/ui.js:17105) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-should-i-measure-guide-positions",
        "how-should-i-number-guides-in-a-spiral-layout",
        "where-should-the-stripper-guide-sit-on-a-spinning-rod"
      ],
      "sections": [
        {
          "heading": "Establish the reference",
          "blocks": [
            {
              "type": "p",
              "text": "Set the handle or chosen reel-seat reference first and support the rod on the bench. On an inline layout, sight along the row of openings under consistent lighting. On a spiral, compare each guide with its specified rotation rather than looking for one straight row."
            }
          ]
        },
        {
          "heading": "Check the same position before and after wrapping",
          "blocks": [
            {
              "type": "p",
              "text": "Sight from the same end and keep the reel-side reference fixed when comparing the temporary layout with the wrapped one. Fuji’s skeleton-seat instructions show an alignment card that can be used for the guides after the seat is fitted."
            }
          ]
        },
        {
          "heading": "Record rotation as well as position",
          "blocks": [
            {
              "type": "p",
              "text": "Keep the guide number and station on the drawing beside its rotation. An opening can be at the correct distance along the blank and still face the wrong way. Studio’s Guide Setup keeps positioning and orientation information available for this comparison."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-use-a-grip-wrap-calculator",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Using Studio’s Grip Wrap Calculator",
      "summary": "Enter the straight or tapered grip dimensions, cover width and trimming allowance to estimate material for a continuous spiral wrap.",
      "aliases": [
        "How do I use a grip-wrap calculator?",
        "use a grip-wrap calculator",
        "How to use a grip-wrap calculator"
      ],
      "tags": [
        "workshop",
        "measurement",
        "calculators"
      ],
      "source": "K-Labs Studio, Workshop Grip Wrap implementation (K-Labs Studio source dfa17b0: js/ui.js:999,2243,2464; index.html:350–415; tests/grip-wrap-layout.test.cjs)",
      "related": [
        "how-should-i-measure-a-tapered-grip",
        "how-do-i-convert-circumference-to-diameter",
        "how-do-i-measure-a-blank-s-diameter-accurately"
      ],
      "sections": [
        {
          "heading": "Enter the profile you are covering",
          "blocks": [
            {
              "type": "p",
              "text": "In Studio, open Workshop → Grip Wrap. Choose Straight Grip for a constant diameter, or Tapered Grip for separate start and end diameters. Enter the covered length and the cover width or cord diameter, checking the displayed units before comparing the result with your stock."
            }
          ]
        },
        {
          "heading": "Read the outputs separately",
          "blocks": [
            {
              "type": "p",
              "text": "Theoretical Wrap Length is the modeled spiral. Material Required includes the trimming allowance you entered. A tapered profile also displays separate start and finish cut angles. Write down both the profile and the allowance so you can recreate the estimate later."
            }
          ]
        },
        {
          "heading": "Keep the layout assumption visible",
          "blocks": [
            {
              "type": "p",
              "text": "The calculator assumes turns meet without a gap or overlap. If your layout deliberately leaves a gap or overlaps the previous turn, treat this output as a different layout. If you use Print Cut Template, select actual size and check the printed calibration line."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-number-guides-in-a-spiral-layout",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Numbering guides on a spiral-wrapped rod",
      "summary": "Pick a numbering direction and record guide position and rotation separately so transition guides can be identified without guessing.",
      "aliases": [
        "How should I number guides in a spiral layout?",
        "number guides in a spiral layout",
        "How to number guides in a spiral layout"
      ],
      "tags": [
        "spiral",
        "wraps",
        "casting",
        "orientations"
      ],
      "source": "Tom Kirkman, RodMaker Magazine, Simple Spiral Revisited (https://www.rodmakermagazine.com/wp-content/uploads/2025/06/simplespiral.pdf) | K-Labs Studio, Guide Setup implementation (K-Labs Studio source dfa17b0: js/ui.js:1093,1190,1340,1359 and README.md:55)",
      "related": [
        "how-do-i-check-whether-a-guide-train-is-aligned",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Name the direction before assigning numbers",
          "blocks": [
            {
              "type": "p",
              "text": "A spiral train has guides at different rotations between the reel and the underside. For a workshop drawing you can number from the reel toward the tip. Write that direction at the top of the drawing and state whether the tip top is counted or listed separately."
            }
          ]
        },
        {
          "heading": "Give each transition guide its own row",
          "blocks": [
            {
              "type": "p",
              "text": "Record the number, the position along the blank, the distance reference and the viewing direction used for rotation. For example, identify the first transition guide by its station and angle rather than merely writing “side guide.”"
            }
          ]
        },
        {
          "heading": "Translate supplier diagrams explicitly",
          "blocks": [
            {
              "type": "p",
              "text": "If an existing diagram numbers from the other end, write both identifiers beside the corresponding part before you copy dimensions. Keep the same identifiers on the temporary layout and finished record so a later repair refers to the right guide."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-difference-between-rod-power-and-action",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What rod power and action describe",
      "summary": "Power describes resistance to bending. Action describes where the bend develops, so keep both labels when comparing blank models.",
      "aliases": [
        "What is the difference between rod power and action?",
        "rod power and action",
        "fishing rod power and action"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "Lamiglas, Rod Education (https://www.lamiglas.com/pages/rod-education) | St. Croix Rod, Mojo Musky model specifications (https://stcroixrods.com/collections/musky-pike/products/mojo-musky)",
      "related": [
        "how-do-i-choose-a-rod-blank-for-a-particular-lure"
      ],
      "sections": [
        {
          "heading": "Read power and action separately",
          "blocks": [
            {
              "type": "p",
              "text": "Power describes how much the rod resists bending. Action describes the shape of that bend. Faster actions concentrate more of the initial flex toward the tip, while a moderate action typically bends farther down. A rod can have substantial power and still have a moderate action."
            }
          ]
        },
        {
          "heading": "Compare within the intended use",
          "blocks": [
            {
              "type": "p",
              "text": "Lamiglas gives different examples of what medium power means for surf and steelhead rods. Read the model’s intended application and stated line and lure ratings alongside its power label. Record the manufacturer’s wording rather than converting one brand’s category into another."
            }
          ]
        },
        {
          "heading": "Write both fields on the order",
          "blocks": [
            {
              "type": "p",
              "text": "If a customer asks for a medium rod, establish which rod family they have in mind and ask what sort of bend they like. Keep the requested action separate on the order sheet so that a change of blank model does not quietly change both choices."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-difference-between-single-foot-and-double-foot-guides",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Single-foot and double-foot rod guides",
      "summary": "Compare the number of attachment feet, the wrap footprint, and the frame’s intended job before substituting guides.",
      "aliases": [
        "What is the difference between single-foot and double-foot guides?",
        "single-foot and double-foot guides"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, KW stainless guide dimensional sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_KW_stain.pdf) | Fuji Kogyo, KL titanium guide dimensional sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/11/2022_KL_titanium.pdf) | Fuji Kogyo, Reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-do-i-choose-guide-ring-material",
        "how-do-i-select-a-tip-top-guide",
        "should-i-use-titanium-guide-frames",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Count the feet on the component",
          "blocks": [
            {
              "type": "p",
              "text": "A single-foot frame meets the blank at one foot. A double-foot frame has feet on both sides of the ring. That gives you one or two places to wrap respectively. In the Fuji K-Series, KW is an example of a double-foot frame and KL is an example of a single-foot frame."
            }
          ]
        },
        {
          "heading": "Match the job as well as the size",
          "blocks": [
            {
              "type": "p",
              "text": "On a replacement, note whether the old guide was a stripper, reducer or runner. Compare the new frame’s ring height, clear opening and feet with the original at that station. Foot count describes how the frame mounts. Check the guide family and line path to decide which station it suits."
            }
          ]
        },
        {
          "heading": "Lay the frames next to the rod",
          "blocks": [
            {
              "type": "p",
              "text": "If a replacement has feet that extend beyond the old wrap marks, record the new footprint before you agree on the appearance of the repair. For a new build, compare the actual footprint and mass of the candidate frames instead of treating foot count as a weight specification."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-document-a-repair-before-starting",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Documenting a rod repair at intake",
      "summary": "Record the rod’s identity, its visible condition and the customer’s account before preparing a repair estimate or accepting work.",
      "aliases": [
        "How do I document a repair before starting?",
        "document a repair before starting",
        "How to document a repair before starting"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "St. Croix Rod, Service and Warranty (https://stcroixrods.com/pages/service-and-warranty) | Business.govt.nz, How to prepare a quote (https://www.business.govt.nz/browse-our-resource-library/tips-for-tradies/how-to-prepare-a-quote)",
      "related": [
        "how-should-i-clean-saltwater-fishing-rods",
        "how-should-i-store-multi-piece-rods",
        "how-do-i-quote-a-rod-repair"
      ],
      "sections": [
        {
          "heading": "Identify what arrived",
          "blocks": [
            {
              "type": "p",
              "text": "Record the make, model and serial number when they are legible. Take an overall photo and a close-up with a location reference, such as the second running guide from the tip. For a multi-piece rod, label which section is pictured and note which sections and accessories came in."
            }
          ]
        },
        {
          "heading": "Separate observation from history",
          "blocks": [
            {
              "type": "p",
              "text": "For example, write “insert missing from second runner” in the condition note and keep “owner noticed this after transport” in the customer history. That gives the workshop a useful description without turning an account of events into a diagnosis."
            }
          ]
        },
        {
          "heading": "Hand off a clear next step",
          "blocks": [
            {
              "type": "p",
              "text": "Use the intake record to agree which part is being assessed and whether the customer wants an estimate first. Keep the photos and the date with the job so the estimate and finished record refer to the same rod."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-estimate-time-for-a-rod-repair",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Estimating bench time for a rod repair",
      "summary": "Break the job into inspection, parts matching and bench work. Keep hands-on time separate from the collection date.",
      "aliases": [
        "How do I estimate time for a rod repair?",
        "estimate time for a rod repair",
        "estimate time for a fishing rod repair",
        "How to estimate time for a rod repair"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "Business.govt.nz, How to prepare a quote (https://www.business.govt.nz/browse-our-resource-library/tips-for-tradies/how-to-prepare-a-quote)",
      "related": [
        "how-should-i-clean-saltwater-fishing-rods",
        "how-should-i-store-multi-piece-rods",
        "how-do-i-document-a-repair-before-starting",
        "how-do-i-quote-a-rod-repair"
      ],
      "sections": [
        {
          "heading": "Price the bench time in stages",
          "blocks": [
            {
              "type": "p",
              "text": "List what has to be checked, what has to be matched or ordered, and the work you can already see. If the repair is an isolated guide replacement, list the bench operations for that guide separately from work elsewhere on the rod. Estimate the known stages before allowing for uncertain ones."
            }
          ]
        },
        {
          "heading": "Keep elapsed time separate",
          "blocks": [
            {
              "type": "p",
              "text": "A short bench operation can still have a later handover if the matching part is unavailable. Record parts availability and the current bench queue alongside the estimate. Give the customer an update point if either remains uncertain."
            }
          ]
        },
        {
          "heading": "Review the estimate when the scope changes",
          "blocks": [
            {
              "type": "p",
              "text": "If a check identifies another damaged guide, keep the original estimate on the job and prepare the additional scope on its own line. On completion, compare the time spent with the estimate to improve the next similar quote."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-quote-a-rod-repair",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Preparing a quote for a rod repair",
      "summary": "Describe the repair you are pricing, the parts included and how you will handle additional work found during the job.",
      "aliases": [
        "How do I quote a rod repair?",
        "quote a rod repair",
        "quote a fishing rod repair",
        "How to quote a rod repair"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "Business.govt.nz, How to prepare a quote (https://www.business.govt.nz/browse-our-resource-library/tips-for-tradies/how-to-prepare-a-quote)",
      "related": [
        "what-information-should-i-collect-before-quoting-a-custom-rod",
        "how-should-i-compare-component-cost-and-selling-price",
        "what-should-a-rod-build-confirmation-include",
        "how-do-i-document-a-repair-before-starting"
      ],
      "sections": [
        {
          "heading": "Quote a stated scope",
          "blocks": [
            {
              "type": "p",
              "text": "Refer to the intake record and name the part and position, such as replacing the stripper and matching its wrap colour as closely as stock allows. State whether the quote includes parts, labour and return delivery, and identify anything still awaiting inspection."
            }
          ]
        },
        {
          "heading": "Price the unknowns separately",
          "blocks": [
            {
              "type": "p",
              "text": "If several guide options are possible, write down which one the amount covers. If the condition of the surrounding area could change the scope, give an inspection step and agree when to contact the owner with a revised price."
            }
          ]
        },
        {
          "heading": "Send a version the owner can accept",
          "blocks": [
            {
              "type": "p",
              "text": "Identify the rod, scope, customer total and expected timing in the version you send. Keep the accepted version with the job. If the customer later asks for a complete guide set, describe and price that as a new scope."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-clean-saltwater-fishing-rods",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Cleaning a fishing rod after saltwater use",
      "summary": "Rinse the rod with fresh water, attend to the guides and grip, then wipe it down and let it dry before storage.",
      "aliases": [
        "How should I clean saltwater fishing rods?",
        "clean saltwater fishing rods",
        "How to clean saltwater fishing rods"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "ONE&ONE, Pack Rod Product Care (https://www.oneandonefishing.com/pages/pack-rod-product-care) | Orvis, Extending the Life of Your Fly Fishing Equipment (https://www.orvis.co.uk/blogs/explore-orvis/fly-fishing-gear-maintenance-extending-the-life-of-your-equipment)",
      "related": [
        "how-should-i-store-multi-piece-rods"
      ],
      "sections": [
        {
          "heading": "Rinse the areas that collect grit and salt",
          "blocks": [
            {
              "type": "p",
              "text": "Use fresh water on the blank, guide frames, rings and the grip area. Work along the rod so the undersides of the guides get attention too. For periodic cleaning, follow the rod maker’s instructions for any cleaner and use a soft cloth."
            }
          ]
        },
        {
          "heading": "Dry before packing",
          "blocks": [
            {
              "type": "p",
              "text": "Wipe off the water with a clean cloth and give the rod time to air dry. Check around the frame feet and handle seams before slipping it into its sleeve. Deal with the reel separately under its own maintenance instructions."
            }
          ]
        },
        {
          "heading": "Take a second look at stubborn marks",
          "blocks": [
            {
              "type": "p",
              "text": "Once the rod is clean, inspect the spot again. If it still looks chipped or corroded, record which guide or fitting it is and arrange an inspection. Keep suspected component damage separate from the cleaning job."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-handle-delivery-charges-on-a-custom-rod",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Quoting delivery charges for a custom rod",
      "summary": "Record the agreed delivery method and customer charge in the quote, and keep the workshop’s freight and packaging assumptions traceable.",
      "aliases": [
        "How should I handle delivery charges on a custom rod?",
        "handle delivery charges on a custom rod",
        "How to handle delivery charges on a custom rod"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "NZ Post, Complying with our sending standards (https://www.nzpost.co.nz/business/shipping-in-nz/sending-standards) | K-Labs Studio, Delivery entry and customer quote (K-Labs Studio source dfa17b0: index.html:1090–1091; js/ui.js:3939,4420,15443)",
      "related": [
        "what-information-should-i-collect-before-quoting-a-custom-rod",
        "how-should-i-compare-component-cost-and-selling-price",
        "what-should-a-rod-build-confirmation-include",
        "how-should-i-prepare-a-customer-facing-invoice"
      ],
      "sections": [
        {
          "heading": "Price the delivery method you are offering",
          "blocks": [
            {
              "type": "p",
              "text": "Confirm collection or courier and the destination before completing the quote. For courier, price the packed rod using the package you expect to send. Keep carrier assumptions with the job so a change in destination or packing can be checked against the original figure."
            }
          ]
        },
        {
          "heading": "Check the customer-facing total",
          "blocks": [
            {
              "type": "p",
              "text": "Studio’s Freight and Packaging fields are workshop cost inputs. Check the delivery charge and customer-facing total separately in the Customer Quote. If the customer changes to collection, check the revised fulfilment method and total before sending."
            }
          ]
        },
        {
          "heading": "Keep a record when the charge changes",
          "blocks": [
            {
              "type": "p",
              "text": "Record what the accepted quote included and what changed. If delivery was included in the price, say so in the quote. If it is priced separately, check that the separate line and final total agree before sending."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-list-components-used-in-a-refurbishment",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Recording components on a rod refurbishment",
      "summary": "Record what was retained, supplied and replaced, with each component tied to its position and the finished job.",
      "aliases": [
        "How should I list components used in a refurbishment?",
        "list components used in a refurbishment",
        "How to list components used in a refurbishment"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "K-Labs Studio, Build layout and component specification (K-Labs Studio source dfa17b0: js/ui.js:4284,4644,1448,17105,17153) | K-Labs Studio, Lifecycle and customer documents (K-Labs Studio source dfa17b0: js/ui.js:15426,15457,15484,15512; README.md:24)",
      "related": [
        "what-information-should-i-collect-before-quoting-a-custom-rod",
        "how-should-i-compare-component-cost-and-selling-price",
        "what-should-a-rod-build-confirmation-include",
        "how-do-i-document-a-repair-before-starting"
      ],
      "sections": [
        {
          "heading": "Separate parts by outcome",
          "blocks": [
            {
              "type": "p",
              "text": "On the bench record, identify each item and mark whether it stayed on the rod or was replaced. For instance, distinguish the existing stripper that was retained from the replacement runner and top supplied for the job. Keep their positions clear if several look alike."
            }
          ]
        },
        {
          "heading": "Record the fitted item",
          "blocks": [
            {
              "type": "p",
              "text": "For a replacement, record the exact model, size and quantity where known. When using a Studio library item, select the specific component and size so the record reflects the part used. Keep custom or unidentified parts clear in the workshop notes."
            }
          ]
        },
        {
          "heading": "Review the record at handover",
          "blocks": [
            {
              "type": "p",
              "text": "Compare planned replacements with what was actually fitted. Check the customer’s description against the finished rod and keep internal cost details on the workshop side of the record."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-prepare-a-customer-facing-invoice",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Preparing a customer invoice for a custom rod",
      "summary": "Check the customer, rod description, charges and payment details before issuing the invoice, then retain the issued document.",
      "aliases": [
        "How should I prepare a customer-facing invoice?",
        "prepare a customer-facing invoice",
        "How to prepare a customer-facing invoice"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "Business.govt.nz, How to prepare an invoice (https://www.business.govt.nz/browse-our-resource-library/tips-for-tradies/how-to-prepare-an-invoice) | Inland Revenue, How taxable supply information for GST works (https://www.ird.govt.nz/gst/tax-invoices-for-gst/how-tax-invoices-for-gst-work) | K-Labs Studio, Invoice issuance and Payment Statement (K-Labs Studio source dfa17b0: js/ui.js:15690,15722,15843,15899,15961; README.md:24)",
      "related": [
        "what-information-should-i-collect-before-quoting-a-custom-rod",
        "how-should-i-compare-component-cost-and-selling-price",
        "what-should-a-rod-build-confirmation-include",
        "how-should-i-record-a-customer-deposit"
      ],
      "sections": [
        {
          "heading": "Identify the work and the parties",
          "blocks": [
            {
              "type": "p",
              "text": "Check the business and customer details, invoice reference, issue date and due date. Describe the rod or repair in terms the customer recognises. If the order contains more than one rod, use the build references or descriptions to make the lines easy to match."
            }
          ]
        },
        {
          "heading": "Review the amounts before issue",
          "blocks": [
            {
              "type": "p",
              "text": "Check the accepted scope, charges and currency against the document. For New Zealand GST records, consult Inland Revenue’s taxable supply information guidance for the type and value of supply. A workshop checklist and the applicable tax-record requirements serve different purposes."
            }
          ]
        },
        {
          "heading": "Keep the issued version",
          "blocks": [
            {
              "type": "p",
              "text": "In Studio, preview the invoice before issue. Issuing saves a customer-facing snapshot. Use the existing invoice for a reprint and the Payment Statement for later payments, so the customer can see which document records the charge and which reflects payment activity."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-record-a-customer-deposit",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Recording a customer deposit on a rod build",
      "summary": "Keep the agreed deposit requirement separate from the payment received, then check the balance against the saved payment record.",
      "aliases": [
        "How should I record a customer deposit?",
        "record a customer deposit",
        "How to record a customer deposit"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "K-Labs Studio, Deposit and payment confirmation (K-Labs Studio source dfa17b0: js/ui.js:9941,15512,18478; README.md:22) | K-Labs Studio, Lifecycle and customer documents (K-Labs Studio source dfa17b0: js/ui.js:15426,15457,15484,15512; README.md:24)",
      "related": [
        "what-information-should-i-collect-before-quoting-a-custom-rod",
        "how-should-i-compare-component-cost-and-selling-price",
        "what-should-a-rod-build-confirmation-include",
        "how-should-i-prepare-a-customer-facing-invoice"
      ],
      "sections": [
        {
          "heading": "Distinguish the requirement from the receipt",
          "blocks": [
            {
              "type": "p",
              "text": "The quote can state the deposit expected before work starts. When money arrives, record the actual payment against the matching build. For example, if the customer sends only part of the deposit, keep both the agreed requirement and the received amount visible."
            }
          ]
        },
        {
          "heading": "Verify the saved payment",
          "blocks": [
            {
              "type": "p",
              "text": "Studio records a deposit or balance payment on a saved, synchronised build and waits for server confirmation. If that confirmation is interrupted, use Confirm Pending Transaction on that build before another attempt. Check the resulting payment status and balance."
            }
          ]
        },
        {
          "heading": "Match the customer’s paperwork",
          "blocks": [
            {
              "type": "p",
              "text": "Use the build reference when checking the payment against the customer’s transfer. Review the customer-facing document for the amount received and any balance owing. Keep the payment reference in the workshop’s payment record for follow-up."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-store-multi-piece-rods",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Storing a multi-piece fishing rod",
      "summary": "Dry the separated rod sections and use a sleeve and case that accommodate the longest section without crowding the tip.",
      "aliases": [
        "How should I store multi-piece rods?",
        "store multi-piece rods",
        "How to store multi-piece rods"
      ],
      "tags": [
        "maintenance",
        "workshop",
        "practice"
      ],
      "source": "ONE&ONE, Pack Rod Product Care (https://www.oneandonefishing.com/pages/pack-rod-product-care) | Orvis, Extending the Life of Your Fly Fishing Equipment (https://www.orvis.co.uk/blogs/explore-orvis/fly-fishing-gear-maintenance-extending-the-life-of-your-equipment)",
      "related": [
        "how-should-i-clean-saltwater-fishing-rods",
        "how-does-the-number-of-blank-sections-affect-a-rod"
      ],
      "sections": [
        {
          "heading": "Pack the rod dry",
          "blocks": [
            {
              "type": "p",
              "text": "After a trip, take the rod down in accordance with the maker’s directions. Check that the sections and sleeve are dry before packing. If the sleeve got wet in transit, remove the sections and let the sleeve dry separately."
            }
          ]
        },
        {
          "heading": "Give the tip room in its sleeve",
          "blocks": [
            {
              "type": "p",
              "text": "Use the sleeve pockets where provided to separate the sections, and choose a case that fits the longest one. Check the ends before closing the case so that the tip and guides are clear of the closure."
            }
          ]
        },
        {
          "heading": "Choose a suitable storage location",
          "blocks": [
            {
              "type": "p",
              "text": "Keep the packed rod in a dry place away from direct sun and where the case will stay clear of other gear. Before the next trip, confirm every section is there and inspect the joints and guides while the rod is out of the sleeve."
            }
          ]
        }
      ]
    },
    {
      "id": "what-information-should-i-collect-before-quoting-a-custom-rod",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What to ask before quoting a custom rod",
      "summary": "Gather the intended fishing setup, fit preferences, scope and delivery details before pricing the custom build.",
      "aliases": [
        "What information should I collect before quoting a custom rod?"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "St. Croix Rod, Mojo Bass model specifications (https://stcroixrods.com/products/mojo-bass) | Business.govt.nz, How to prepare a quote (https://www.business.govt.nz/browse-our-resource-library/tips-for-tradies/how-to-prepare-a-quote) | K-Labs Studio, Lifecycle and customer documents (K-Labs Studio source dfa17b0: js/ui.js:15426,15457,15484,15512; README.md:24)",
      "related": [
        "how-should-i-compare-component-cost-and-selling-price",
        "what-should-a-rod-build-confirmation-include",
        "how-should-i-record-a-customer-deposit",
        "what-should-be-included-in-a-rod-specification-sheet"
      ],
      "sections": [
        {
          "heading": "Ask how the rod will be fished",
          "blocks": [
            {
              "type": "p",
              "text": "Get the technique, intended reel and line arrangement, and the lure or rig the customer normally casts. Ask what they want to keep or change from a rod they already use. A specific reel and familiar handle give the builder a better brief than a finish colour alone."
            }
          ]
        },
        {
          "heading": "Separate decisions from options",
          "blocks": [
            {
              "type": "p",
              "text": "Write down the agreed blank or intended specification, handle arrangement and any essential components. Put undecided items on a list, with alternatives if useful. If a component choice can materially change cost, keep it visible before sending a price."
            }
          ]
        },
        {
          "heading": "Confirm the commercial details",
          "blocks": [
            {
              "type": "p",
              "text": "Record the customer details, estimated timing, delivery method and any deposit arrangement to include in the quote. Read back the key scope and assumptions before treating the document as ready for the customer."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-difference-between-a-quote-and-a-completed-build-record",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "A rod quote versus a completed build record",
      "summary": "Use the quote to record the proposed scope and price, and the completed record to document the rod and components actually delivered.",
      "aliases": [
        "What is the difference between a quote and a completed build record?",
        "a quote and a completed build record"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "Business.govt.nz, How to prepare a quote (https://www.business.govt.nz/browse-our-resource-library/tips-for-tradies/how-to-prepare-a-quote) | K-Labs Studio, Lifecycle and customer documents (K-Labs Studio source dfa17b0: js/ui.js:15426,15457,15484,15512; README.md:24) | K-Labs Studio, Invoice issuance and Payment Statement (K-Labs Studio source dfa17b0: js/ui.js:15690,15722,15843,15899,15961; README.md:24)",
      "related": [
        "what-information-should-i-collect-before-quoting-a-custom-rod",
        "how-should-i-compare-component-cost-and-selling-price",
        "what-should-a-rod-build-confirmation-include",
        "what-should-be-included-in-a-rod-specification-sheet"
      ],
      "sections": [
        {
          "heading": "Keep the proposed build identifiable",
          "blocks": [
            {
              "type": "p",
              "text": "A quote sets out the work and price for the customer to consider. Keep the version the customer accepted with the job reference. If the specification later changes, retain the original and record the agreed change against it."
            }
          ]
        },
        {
          "heading": "Record the built rod at handover",
          "blocks": [
            {
              "type": "p",
              "text": "Record the finished specification and components actually fitted. If a different guide was agreed because a part was unavailable, the completed record should identify the fitted model while the accepted quote still shows the initial plan."
            }
          ]
        },
        {
          "heading": "Use the document for its stage",
          "blocks": [
            {
              "type": "p",
              "text": "Studio’s document progression for a rod build is Customer Quote, Build Confirmation and Build Summary. Check the current stage before sending a document, and use the Customer Invoice when issuing the charge."
            }
          ]
        }
      ]
    },
    {
      "id": "what-should-a-rod-build-confirmation-include",
      "category": "faqs",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What a rod build confirmation should include",
      "summary": "Confirm the agreed rod, major parts, expected completion and payment position before the job proceeds through the workshop.",
      "aliases": [
        "What should a rod build confirmation include?",
        "what should a fishing rod build confirmation include"
      ],
      "tags": [
        "studio",
        "workflow",
        "records"
      ],
      "source": "K-Labs Studio, Lifecycle and customer documents (K-Labs Studio source dfa17b0: js/ui.js:15426,15457,15484,15512; README.md:24) | K-Labs Studio, Deposit and payment confirmation (K-Labs Studio source dfa17b0: js/ui.js:9941,15512,18478; README.md:22) | Business.govt.nz, How to prepare a quote (https://www.business.govt.nz/browse-our-resource-library/tips-for-tradies/how-to-prepare-a-quote)",
      "related": [
        "what-information-should-i-collect-before-quoting-a-custom-rod",
        "how-should-i-compare-component-cost-and-selling-price",
        "how-should-i-record-a-customer-deposit",
        "what-is-the-difference-between-a-quote-and-a-completed-build-record"
      ],
      "sections": [
        {
          "heading": "Show the rod the customer approved",
          "blocks": [
            {
              "type": "p",
              "text": "Identify the customer and build, describe the agreed rod, and list the major specifications and components that define the order. If the reel seat or finish colour was a decisive choice, make it easy for the customer to find that detail."
            }
          ]
        },
        {
          "heading": "Make timing and amounts easy to read",
          "blocks": [
            {
              "type": "p",
              "text": "State the estimated completion date if known, how the rod is to be handed over, the agreed total and any actual payments. Check whether a deposit is still due before you send. In Studio, preview Build Confirmation from the active build."
            }
          ]
        },
        {
          "heading": "Review substitutions against the order",
          "blocks": [
            {
              "type": "p",
              "text": "Check the confirmation against the accepted quote before sending, especially if a part was changed or a delivery option was added. Keep the agreed change with the build so the confirmation and bench record can be traced back to the same decision."
            }
          ]
        }
      ]
    },
    {
      "id": "what-should-be-included-in-a-rod-specification-sheet",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What to include on a rod specification sheet",
      "summary": "Record the exact blank and fitted components, named measurement references and model-specific ratings so the finished layout can be understood later.",
      "aliases": [
        "What should be included in a rod specification sheet?",
        "what should be included in a fishing rod specification sheet"
      ],
      "tags": [
        "workshop",
        "measurement",
        "calculators"
      ],
      "source": "North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/) | K-Labs Studio, Build layout and component specification (K-Labs Studio source dfa17b0: js/ui.js:4284,4644,1448,17105,17153) | K-Labs Studio, Lifecycle and customer documents (K-Labs Studio source dfa17b0: js/ui.js:15426,15457,15484,15512; README.md:24)",
      "related": [
        "how-do-i-convert-circumference-to-diameter",
        "how-do-i-measure-a-blank-s-diameter-accurately",
        "how-should-i-record-measurements-in-millimetres-and-inches",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Identify the rod before listing dimensions",
          "blocks": [
            {
              "type": "p",
              "text": "Record the maker and model of the blank, the finished length and the type of build. Label line and lure ratings separately and keep their published units. Distinguish the maker’s rating from a finished measurement taken at the bench."
            }
          ]
        },
        {
          "heading": "Make the layout repeatable",
          "blocks": [
            {
              "type": "p",
              "text": "Record the reel seat position and its reference point, the guide order, and the exact parts and sizes where known. State whether guide positions run from the tip or butt so another builder can interpret the sheet correctly."
            }
          ]
        },
        {
          "heading": "Separate work notes from customer details",
          "blocks": [
            {
              "type": "p",
              "text": "Use the workshop record for measurement references, substitutions and other details needed to reproduce the layout. Review the customer document for the finished identity and agreed parts. Studio’s customer documents keep internal costs and margins out of the customer view."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-choose-a-rod-blank-for-a-particular-lure",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing a rod blank for a particular lure",
      "summary": "Start with the lure and rig you actually cast, then compare the blank maker’s rating, application, action and power for the exact model.",
      "aliases": [
        "How do I choose a rod blank for a particular lure?",
        "choose a rod blank for a particular lure",
        "choose a fishing rod blank for a particular lure",
        "How to choose a rod blank for a particular lure"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/)",
      "related": [
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Write down the outfit",
          "blocks": [
            {
              "type": "p",
              "text": "Record the common lure and its fishing configuration. If a soft plastic is normally fished on a jig head, weigh the combination and note the units. That gives you one repeatable comparison when reading the manufacturer’s model table."
            }
          ]
        },
        {
          "heading": "Shortlist by application",
          "blocks": [
            {
              "type": "p",
              "text": "Compare candidates listed for that style of fishing. A catalogue can show the same overall length on blanks with different action, power and lure ranges. If two candidates cover the everyday lure, compare those remaining specifications and the maker’s intended application before choosing the handle or guides."
            }
          ]
        },
        {
          "heading": "Keep the model on the build sheet",
          "blocks": [
            {
              "type": "p",
              "text": "Record the exact model and its listed range beside the actual rig you used to make the decision. If the customer changes from small jigs to larger swimbaits, revisit that shortlist with the new rig in hand."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-choose-between-cork-and-eva-grips",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing between cork and EVA rod grips",
      "summary": "Compare cork and EVA grips at the shape and size you will actually hold, including the bore and how each meets the reel seat.",
      "aliases": [
        "How do I choose between cork and EVA grips?",
        "choose between cork and eva grips",
        "How to choose between cork and EVA grips"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "American Tackle, Cork Foregrip (https://www.americantackle.us/product-page/cork-foregrip) | American Tackle, EVA Foam Foregrips (https://www.americantackle.us/product-page/eva-foam-foregrips) | Fuji Kogyo, Grip Design (https://www.fujitackle.com/plus/from-rod-building-studio/grip-design/) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "how-do-i-measure-reel-seat-position",
        "should-i-use-an-exposed-blank-reel-seat",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Compare the finished shape",
          "blocks": [
            {
              "type": "p",
              "text": "Compare cork and EVA in the handle shape and length you want to hold. American Tackle publishes separate cork and EVA foregrip listings. Specify the shape as well as the material so the two candidates are comparable."
            }
          ]
        },
        {
          "heading": "Check the catalogue bore",
          "blocks": [
            {
              "type": "p",
              "text": "Read the bore for the exact part. American Tackle’s cork table separates inside and outside diameters and length. Its EVA listing uses length and hole diameter in its sizing. Compare the part with the blank at the station where it will actually sit."
            }
          ]
        },
        {
          "heading": "Dry fit the transition",
          "blocks": [
            {
              "type": "p",
              "text": "Place the chosen foregrip at the seat and check it with the intended reel fitted. Look where the fingers cross the join and where the grip ends against the blank. Write down the material, part number and finished profile so a later reorder preserves the intended shape."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-choose-the-correct-reel-seat-size",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing the correct reel seat size",
      "summary": "Check how the seat fits the blank, how its hoods capture the reel foot, and how the outside profile joins the grips.",
      "aliases": [
        "How do I choose the correct reel-seat size?",
        "choose the correct reel-seat size",
        "How to choose the correct reel-seat size"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Fuji Kogyo, DPS/SBDPS pipe seat specification (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_DPS.pdf) | Flex Coat, Custom Fitting Reel Seat Arbors (https://flexcoat.com/blogs/rod-building-resources/custom-fitting-reel-seat-arbors) | Fuji Kogyo, 2025 catalogue corrections, ECS seat (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2025/01/a6286edbc9a2a0f5c32512d08b6ea843.pdf) | Fuji Kogyo, SKSS/SKTS skeleton reel seats (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_SKSS_SKTS.pdf) | Fuji Kogyo, Grip Design (https://www.fujitackle.com/plus/from-rod-building-studio/grip-design/)",
      "related": [
        "how-do-i-measure-reel-seat-position",
        "should-i-use-an-exposed-blank-reel-seat",
        "what-are-reel-seat-arbors-and-why-are-they-used",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Measure the blank at the seat",
          "blocks": [
            {
              "type": "p",
              "text": "Measure at the planned seat position. Compare the bare blank or the proposed arbor with the seat’s specified bore, depending on its design. The Fuji DPS table has separate columns for catalogue size and inside diameter."
            }
          ]
        },
        {
          "heading": "Fit the actual reel",
          "blocks": [
            {
              "type": "p",
              "text": "Seat the reel foot under both hoods and close the locking mechanism during the dry fit. Check which parts of the reel foot sit inside the hoods and whether there is usable adjustment left. Repeat with any alternate reel the customer expects to fish."
            }
          ]
        },
        {
          "heading": "Check the outside of the assembly",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the seat shoulders with the adjacent grip profiles. If a larger seat barrel solves a bore problem, fit the grips again and check the shape in the hand before ordering the full handle set."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-compare-guide-sets-by-total-weight",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Comparing rod guide sets by total weight",
      "summary": "Weigh the complete guides and tip top for each candidate layout, and record where the pieces that account for the difference sit.",
      "aliases": [
        "How do I compare guide sets by total weight?",
        "compare guide sets by total weight",
        "How to compare guide sets by total weight"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "OpenStax, University Physics Volume 1, Conditions for Static Equilibrium (https://openstax.org/books/university-physics-volume-1/pages/12-1-conditions-for-static-equilibrium) | Fuji Kogyo, Torzite ring geometry (https://www.fujitackle.com/fujitackle/onlyone/torzite/)",
      "related": [
        "how-do-i-choose-guide-ring-material",
        "how-do-i-select-a-tip-top-guide",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Compare the same inventory",
          "blocks": [
            {
              "type": "p",
              "text": "Set out the exact guides in order from stripper to tip. Tare a tray and weigh each complete set with its intended top. Make a note of which pieces you counted. Quoted weights for a single guide and a full set answer different purchasing questions."
            }
          ]
        },
        {
          "heading": "Keep the positions beside the weights",
          "blocks": [
            {
              "type": "p",
              "text": "Write down the frame, ring and station for the pieces changed between sets. For example, a lighter tip and a heavier stripper could give close total weights while changing the parts fitted at opposite ends of the rod. The total alone leaves that difference hidden."
            }
          ]
        },
        {
          "heading": "Carry the clearance check forward",
          "blocks": [
            {
              "type": "p",
              "text": "Keep the candidate set’s clear openings on the bench sheet alongside the measured weights. If the lighter option changes the smallest opening, check the line and leader connection before settling the parts list."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-measure-reel-seat-position",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Measuring reel seat position on a rod blank",
      "summary": "Use the finished butt and a named seat edge as your measurement references so the same handle layout can be fitted again.",
      "aliases": [
        "How do I measure reel-seat position?",
        "measure reel-seat position",
        "How to measure reel-seat position"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | K-Labs, Studio Build Details and Guide Setup (K-Labs Studio: index.html:719,987; js/ui.js:17105) | Fuji Kogyo, BRC and BRC-GC butt caps (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2022/10/2022_BRC_BRC-GC.pdf)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "should-i-use-an-exposed-blank-reel-seat",
        "what-are-reel-seat-arbors-and-why-are-they-used",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Pick two physical points",
          "blocks": [
            {
              "type": "p",
              "text": "One repeatable dimension runs from the finished butt to the rear face of the seat where the rear grip meets it. Fit the intended butt cap or fighting butt during the mock-up so both reference points are present."
            }
          ]
        },
        {
          "heading": "Make the reference portable",
          "blocks": [
            {
              "type": "p",
              "text": "Write the direction and units with the distance on the build sheet. If a customer supplies a favourite rod, use the same two reference points on the old and new handle. A number taken to the middle of the reel foot needs its own label."
            }
          ]
        },
        {
          "heading": "Recheck before setting guide positions",
          "blocks": [
            {
              "type": "p",
              "text": "Check the distance with the butt hardware and the seat in their finished dry-fit positions. In Studio Build Details, enter the distance from the butt and choose the corresponding rear, centre or front reference. Recheck the datum when either end of the measurement changes."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-plan-a-split-grip-layout",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Planning a split-grip rod handle",
      "summary": "Set the seat and hand positions first, then dry fit the rear grip, butt grip and checks to see where the exposed gap falls.",
      "aliases": [
        "How do I plan a split-grip layout?",
        "plan a split-grip layout",
        "How to plan a split-grip layout"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Fuji Kogyo, Grip Design (https://www.fujitackle.com/plus/from-rod-building-studio/grip-design/) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | Fuji Kogyo, Rodbuilding materials: metal parts (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_metalparts.pdf)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "how-do-i-measure-reel-seat-position",
        "should-i-use-an-exposed-blank-reel-seat",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Start at the hand positions",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the intended reel and mock up the rear grip and butt grip at the positions the angler will use. Try the handle in the angler’s normal hold. A comfortable reference rod gives you a butt-to-seat dimension to transfer as a starting point."
            }
          ]
        },
        {
          "heading": "Lay out the exposed gap",
          "blocks": [
            {
              "type": "p",
              "text": "With the seat and grip pieces in place, measure the remaining exposed section between the two grip faces. If the gap is wrong for the intended handle, identify which part can move and check the handle feel again before fixing the layout."
            }
          ]
        },
        {
          "heading": "Stage the checks in assembly order",
          "blocks": [
            {
              "type": "p",
              "text": "Put each winding check against the face it will meet and label its station. Two checks on opposite ends of the gap can sit over different blank diameters. Include them in the dry assembly so the chosen parts and their order are recorded together."
            }
          ]
        }
      ]
    },
    {
      "id": "how-does-the-number-of-blank-sections-affect-a-rod",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing between one-piece and multi-piece rods",
      "summary": "Compare assembled length, packed sections and the exact model ratings when deciding whether a rod needs to break down for transport.",
      "aliases": [
        "How does the number of blank sections affect a rod?"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "St. Croix Rod, Premier model specifications (https://stcroixrods.com/products/premier)",
      "related": [
        "how-do-i-choose-a-rod-blank-for-a-particular-lure",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Start with the packed rod",
          "blocks": [
            {
              "type": "p",
              "text": "Measure the space where the rod will travel and compare it with the longest section and its case. Use the maker’s assembled length for the fishing layout. Ask for the longest actual section if the catalogue lists only assembled length and piece count."
            }
          ]
        },
        {
          "heading": "Compare like models",
          "blocks": [
            {
              "type": "p",
              "text": "St. Croix’s Premier table shows examples where one- and two-piece options share listed length, action, power and lure range. Compare the exact models rather than inferring their rating from the number of pieces."
            }
          ]
        },
        {
          "heading": "Keep the joint positions on the layout",
          "blocks": [
            {
              "type": "p",
              "text": "For a multi-piece custom build, record the joints on the blank sketch while the rod is assembled. Store the assembled layout and the section lengths as separate measurements so a transport requirement remains visible when planning the build."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-choose-a-blank-length",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing a rod blank length for the fishing job",
      "summary": "Choose length around how the angler fishes and transports the rod, then compare models of that length by their application and ratings.",
      "aliases": [
        "How should I choose a blank length?",
        "choose a blank length",
        "How to choose a blank length"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "St. Croix Rod, Choosing the Best Bass Rods – Part One (https://stcroixrods.com/blogs/news/choosing-the-best-bass-rods-part-one) | North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | K-Labs, Studio Build Details and Guide Setup (K-Labs Studio: index.html:719,987; js/ui.js:17105)",
      "related": [
        "how-do-i-choose-a-rod-blank-for-a-particular-lure",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Define the working space",
          "blocks": [
            {
              "type": "p",
              "text": "Ask where the rod will be used and how much room the angler has to move it. For example, a small boat and an open bank are different places to swing a rod and bring a fish alongside. Use a familiar rod as a reference for both overall reach and handle length."
            }
          ]
        },
        {
          "heading": "Read across the model table",
          "blocks": [
            {
              "type": "p",
              "text": "Shortlist by intended use and length, then compare lure range, action and power on the same model row. North Fork Composites lists those fields separately. When transport matters, add the piece count and longest section to the shortlist."
            }
          ]
        },
        {
          "heading": "Transfer the right dimension",
          "blocks": [
            {
              "type": "p",
              "text": "Write down both overall rod length and butt-to-seat length. If you change to a longer blank, check where you want the extra length to fall in the finished layout before copying the handle dimensions."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-measure-a-tapered-grip",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Measuring a tapered fishing rod grip",
      "summary": "Record the length, outside profile and bore of a tapered grip separately, with each diameter tied to its measurement station.",
      "aliases": [
        "How should I measure a tapered grip?",
        "measure a tapered grip",
        "How to measure a tapered grip"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Mitutoyo, Check Points for Measuring Instruments (https://www.mitutoyo.com/Images/E12024_Check_Points_for_Measuring_Instruments.pdf)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "how-do-i-measure-reel-seat-position",
        "should-i-use-an-exposed-blank-reel-seat",
        "how-should-i-record-measurements-in-millimetres-and-inches"
      ],
      "sections": [
        {
          "heading": "Label both ends",
          "blocks": [
            {
              "type": "p",
              "text": "Identify the butt-facing and tip-facing ends. Measure the grip along its axis and record the outside size at each end. Where a shoulder or swell matters to the hand fit, mark that station from a named end and record its outside size there too."
            }
          ]
        },
        {
          "heading": "Keep bore and outside profile separate",
          "blocks": [
            {
              "type": "p",
              "text": "Use the caliper orientation and measuring faces intended for each dimension you are checking. The bore data describes fit on the blank. The outside sizes describe the shape and the join against the hardware. Record which reading is which when comparing cork and EVA versions of a similar grip."
            }
          ]
        },
        {
          "heading": "Check the join in a dry fit",
          "blocks": [
            {
              "type": "p",
              "text": "At the seat end, place the grip against the seat and compare the two shoulders. If a measurement seems off, return to the original station with the jaws square and steady. A reading farther along the taper describes a different part of the grip."
            }
          ]
        }
      ]
    },
    {
      "id": "should-i-use-an-exposed-blank-reel-seat",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing an exposed-blank reel seat",
      "summary": "Compare an exposed-blank seat with a conventional barrel by dry fitting the actual reel and checking hand contact and blank fit.",
      "aliases": [
        "Should I use an exposed-blank reel seat?",
        "use an exposed-blank reel seat"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Fuji Kogyo, 2025 catalogue corrections, ECS seat (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2025/01/a6286edbc9a2a0f5c32512d08b6ea843.pdf) | Fuji Kogyo, Grip Design (https://www.fujitackle.com/plus/from-rod-building-studio/grip-design/) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf) | Fuji Kogyo, DPS/SBDPS pipe seat specification (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_DPS.pdf) | Flex Coat, Custom Fitting Reel Seat Arbors (https://flexcoat.com/blogs/rod-building-resources/custom-fitting-reel-seat-arbors)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "how-do-i-measure-reel-seat-position",
        "what-are-reel-seat-arbors-and-why-are-they-used",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Try both hand positions",
          "blocks": [
            {
              "type": "p",
              "text": "An exposed seat has an opening that leaves part of the blank accessible. Put the intended reel in each candidate seat. Check where the angler’s fingers land and whether they actually reach the window in their normal grip."
            }
          ]
        },
        {
          "heading": "Measure the fit at the chosen station",
          "blocks": [
            {
              "type": "p",
              "text": "Check how the chosen seat is sized and compare the blank at the planned position. A fitted model and an arbor-supported barrel use different fit arrangements. An exposed window is a design choice, while the manufacturer’s fit dimensions are a separate requirement."
            }
          ]
        },
        {
          "heading": "Include the adjoining grips",
          "blocks": [
            {
              "type": "p",
              "text": "Mock up the rear grip and any foregrip with the seat. If the rear grip or hood shape moves the hand away from the window, try the conventional seat in the same handle position before ordering."
            }
          ]
        }
      ]
    },
    {
      "id": "what-are-reel-seat-arbors-and-why-are-they-used",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What reel-seat arbors do in a rod handle",
      "summary": "A reel-seat arbor fits between the seat barrel and blank. Compare both mating dimensions before choosing the arbor system.",
      "aliases": [
        "What are reel-seat arbors and why are they used?"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Flex Coat, Custom Fitting Reel Seat Arbors (https://flexcoat.com/blogs/rod-building-resources/custom-fitting-reel-seat-arbors) | Fuji Kogyo, DPS/SBDPS pipe seat specification (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_DPS.pdf) | Fuji Kogyo, 2025 catalogue corrections, ECS seat (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2025/01/a6286edbc9a2a0f5c32512d08b6ea843.pdf) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "how-do-i-measure-reel-seat-position",
        "should-i-use-an-exposed-blank-reel-seat",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Picture both fits",
          "blocks": [
            {
              "type": "p",
              "text": "A barrel can be larger inside than the blank at the reel seat. The arbor occupies that space and locates the barrel on the blank. Check its outer fit in the seat and its inner fit at the planned blank position. A correct seat bore dimension addresses only one of those fits."
            }
          ]
        },
        {
          "heading": "Check the seat design first",
          "blocks": [
            {
              "type": "p",
              "text": "Check the exact seat before choosing a support. A blank-touch model uses its specified blank fit. An arbor-supported barrel has a separate part between it and the blank. Flex Coat’s fitting notes distinguish the seat fit and the bore matched to the taper."
            }
          ]
        },
        {
          "heading": "Mark each support position",
          "blocks": [
            {
              "type": "p",
              "text": "During dry fitting, label the seat position and check every intended support on the taper. When a seat is moved along the blank, revisit the fit at each support before keeping the same arbor dimensions."
            }
          ]
        }
      ]
    },
    {
      "id": "what-does-a-rod-s-casting-weight-rating-tell-me",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Reading a rod’s casting-weight rating",
      "summary": "Use the stated lure weight range for the exact model and keep its units and meaning separate from line rating, power and action.",
      "aliases": [
        "What does a rod's casting-weight rating tell me?",
        "a rod's casting-weight rating tell me"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "St. Croix Rod, Premier model specifications (https://stcroixrods.com/products/premier) | North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/)",
      "related": [
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "what-is-the-difference-between-spinning-and-casting-guide-trains",
        "how-should-i-record-measurements-in-millimetres-and-inches"
      ],
      "sections": [
        {
          "heading": "Read the heading and units",
          "blocks": [
            {
              "type": "p",
              "text": "St. Croix’s Premier tables have separate columns for lure weight in ounces and line weight in pounds. Read from the exact model row and record the heading with the amount. A model name or a power label alone does not convey that figure."
            }
          ]
        },
        {
          "heading": "Compare using one unit",
          "blocks": [
            {
              "type": "p",
              "text": "Weigh the rig you intend to cast and use the same units as the model table. For example, if the rig changes from a bare lure to a lure with added casting weight, record both actual rig weights so the change stays visible when you compare models."
            }
          ]
        },
        {
          "heading": "Keep the rating tied to its application",
          "blocks": [
            {
              "type": "p",
              "text": "Record the maker and exact model beside the figure. If a listing gives a jigging or trolling specification, consult the maker for how to interpret it for the intended use. Leave unspecified casting figures blank on the build sheet."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-a-winding-check",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What a winding check does on a fishing rod",
      "summary": "A winding check finishes the transition around the blank at a grip or seat. Size each one where its finished face will sit.",
      "aliases": [
        "What is a winding check?",
        "a winding check"
      ],
      "tags": [
        "reel",
        "seats",
        "grip",
        "layout"
      ],
      "source": "Fuji Kogyo, Rodbuilding materials: metal parts (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_metalparts.pdf) | Fuji Kogyo, Grip Design (https://www.fujitackle.com/plus/from-rod-building-studio/grip-design/) | Flex Coat, Cork Ring Clamp and handle assembly instructions (https://flexcoat.com/wp-content/uploads/CorkRingClamp2023.pdf)",
      "related": [
        "how-do-i-choose-the-correct-reel-seat-size",
        "how-do-i-measure-reel-seat-position",
        "should-i-use-an-exposed-blank-reel-seat",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Find the transition",
          "blocks": [
            {
              "type": "p",
              "text": "A check is a ring that sits at a handle transition, commonly where the foregrip ends on the blank or where a split grip meets the exposed section. Lay it out against the adjoining face so you can see which end and profile need to match."
            }
          ]
        },
        {
          "heading": "Size each station separately",
          "blocks": [
            {
              "type": "p",
              "text": "Mark the intended contact point and measure the blank there. On a tapered split-grip blank, the forward and rear checks can require different bores. Label the two parts by position before taking the handle apart."
            }
          ]
        },
        {
          "heading": "Dry fit in sequence",
          "blocks": [
            {
              "type": "p",
              "text": "Stage the checks with their neighbouring grip parts and run through the order they go on the blank. Look down the assembly for an obvious shoulder or gap before choosing the outside profile of each check."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-difference-between-graphite-and-fibreglass-blanks",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Comparing graphite and fibreglass rod blanks",
      "summary": "Identify the material and construction, then compare exact blank models by application, weight and action before choosing between them.",
      "aliases": [
        "What is the difference between graphite and fibreglass blanks?",
        "graphite and fibreglass blanks"
      ],
      "tags": [
        "blanks",
        "rod",
        "design"
      ],
      "source": "St. Croix Rod, Physyx construction materials (https://stcroixrods.com/pages/rod-materials-technologies-and-registration-physyx) | St. Croix Rod, Legend Glass model specifications (https://stcroixrods.com/products/legend-glass) | North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/)",
      "related": [
        "how-do-i-choose-a-rod-blank-for-a-particular-lure",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Read how the maker describes the blank",
          "blocks": [
            {
              "type": "p",
              "text": "Graphite is the usual catalogue term for carbon-fibre rod construction. Fibreglass models use glass reinforcement. Catalogue families can also include hybrids. Read the builder’s material notes as well as the table of model specifications."
            }
          ]
        },
        {
          "heading": "Compare actual candidates",
          "blocks": [
            {
              "type": "p",
              "text": "A fibre label alone does not specify the finished blank’s action, power or weight. St. Croix’s Legend Glass range, for example, uses Linear S-Glass across models with several power ratings. To compare two crankbait blanks, hold the intended lure and technique constant and line up the model rows beside each other."
            }
          ]
        },
        {
          "heading": "Write down what matters to the build",
          "blocks": [
            {
              "type": "p",
              "text": "Record the listed application, the action and power, and the blank weight if available. If a model appeals because of the way an existing rod fishes, keep that rod as a separate handling reference alongside the catalogue comparison."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-measure-a-blank-s-diameter-accurately",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Measuring a fishing rod blank’s diameter",
      "summary": "Use the caliper’s outside jaws at the actual component station, and repeat any reading that changes with the jaws or measuring position.",
      "aliases": [
        "How do I measure a blank's diameter accurately?",
        "measure a blank's diameter accurately",
        "How to measure a blank's diameter accurately"
      ],
      "tags": [
        "workshop",
        "measurement",
        "calculators"
      ],
      "source": "North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/) | Mitutoyo, Check Points for Measuring Instruments (https://www.mitutoyo.com/Images/E12024_Check_Points_for_Measuring_Instruments.pdf)",
      "related": [
        "how-do-i-convert-circumference-to-diameter",
        "how-should-i-measure-guide-positions",
        "how-should-i-record-measurements-in-millimetres-and-inches"
      ],
      "sections": [
        {
          "heading": "Set the station first",
          "blocks": [
            {
              "type": "p",
              "text": "Mark where the seat, winding check or other part will sit. Measure the blank at that mark with the outside jaws. Write the position and units next to the diameter. A catalogue butt diameter gives a reference for the butt and does not describe every point along a taper."
            }
          ]
        },
        {
          "heading": "Get a repeatable reading",
          "blocks": [
            {
              "type": "p",
              "text": "Clean the measuring faces and check zero before starting. Keep the jaws square, use the area near the jaw root and apply steady contact force. If a reading changes, lift and reset the instrument at the same mark so you can check alignment before recording it."
            }
          ]
        },
        {
          "heading": "Preserve the measurement context",
          "blocks": [
            {
              "type": "p",
              "text": "If widths taken across different directions at the same station differ, record the orientation with each figure. For a rigid ring or seat, use the measurements to choose a candidate and dry fit the actual component at the mark."
            }
          ]
        }
      ]
    },
    {
      "id": "can-a-rod-be-designed-for-more-than-one-reel",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Designing a rod for more than one reel",
      "summary": "Set up the rod around its primary reel and compare the alternatives by reel position, line path and clearance before fixing the guides.",
      "aliases": [
        "Can a rod be designed for more than one reel?",
        "can a fishing rod be designed for more than one reel"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | K-Labs Studio, Guide Train Designer geometry (K-Labs Studio v295 source dfa17b0: js/guide-train.js:61,170–175,597–598; README.md:62)",
      "related": [
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "what-is-the-difference-between-spinning-and-casting-guide-trains",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Choose the primary outfit",
          "blocks": [
            {
              "type": "p",
              "text": "Write down the reel, main line and leader the customer expects to fish most. Take reduction-guide measurements with that reel fitted. If a second spinning reel sits higher or has a different spool position, keep its measurements in a separate row so you can see what changed."
            }
          ]
        },
        {
          "heading": "Compare the swap",
          "blocks": [
            {
              "type": "p",
              "text": "Mock up the guide train before wrapping it. Fit each reel in turn and look along the path into the first guides. A reel that fits the seat can still put the line in a different place relative to the stripper. For example, if the alternate setup uses a heavier leader, check both that entry path and the knot through the smallest guides and top."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-choose-guide-ring-material",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing rod guide ring material",
      "summary": "Compare guide inserts within the frame and size you need, and check the actual opening against your line and leader before ordering.",
      "aliases": [
        "How do I choose guide ring material?",
        "choose guide ring material",
        "How to choose guide ring material"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | Fuji Kogyo, Titanium KB dimensional sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_KB_titanium.pdf) | Fuji Kogyo, How to read product codes (https://www.fujitackle.com/fujitackle/productcode/) | Fuji Kogyo, Torzite ring geometry (https://www.fujitackle.com/fujitackle/onlyone/torzite/)",
      "related": [
        "how-do-i-select-a-tip-top-guide",
        "should-i-use-titanium-guide-frames",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Start with the layout",
          "blocks": [
            {
              "type": "p",
              "text": "Choose the guide’s job and required opening first. A tall reduction guide and a low running guide do different work. Picking the same insert material for both tells you nothing about whether either ring is in the right place."
            }
          ]
        },
        {
          "heading": "Compare like for like",
          "blocks": [
            {
              "type": "p",
              "text": "List the frame model, nominal size and ring material separately. For example, Fuji’s titanium KB chart lists Torzite and SiC versions. Compare the exact guide you plan to fit and ask for the clear opening if the drawing gives only the outside diameter. The material name alone does not establish knot clearance."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-select-a-tip-top-guide",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing a tip-top guide for a rod blank",
      "summary": "Specify the tube fit and the line opening separately when replacing a tip top or ordering one for a new blank.",
      "aliases": [
        "How do I select a tip-top guide?",
        "select a tip-top guide",
        "How to select a tip-top guide"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, LG stainless-frame tip-top specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_LG_stain.pdf) | North Fork Composites, Freshwater Rod Blanks (https://northforkcomposites.com/freshwater-rod-blanks/) | Fuji Kogyo, TORZITE ring technical reference (https://www.fujitackle.com/fujitackle/onlyone/torzite/) | Fuji Kogyo, 2023 reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-do-i-choose-guide-ring-material",
        "should-i-use-titanium-guide-frames",
        "how-should-i-record-measurements-in-millimetres-and-inches"
      ],
      "sections": [
        {
          "heading": "Measure the fitting location",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the blank at the fitting location with the specified inside diameter of the tube. On Fuji’s LG sheet, ring and pipe sizes are listed together, while the drawing’s O/D column describes the tube exterior. Use the pipe fit and the units specified for the exact model."
            }
          ]
        },
        {
          "heading": "Check the line opening",
          "blocks": [
            {
              "type": "p",
              "text": "Compare the clear opening with the last running guides and the actual leader knot. For example, if a top has the right tube but catches the knot that passes through every runner, keep the tube requirement and look for a different ring option. Record the exact model and both sizes on the build sheet."
            }
          ]
        }
      ]
    },
    {
      "id": "how-do-i-select-guides-for-braid-and-leader-knots",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing guides for braid and leader knots",
      "summary": "Size the running guides and tip top for the actual tied leader connection, including any knot that sits on the reel before the cast.",
      "aliases": [
        "How do I select guides for braid and leader knots?",
        "select guides for braid and leader knots",
        "How to select guides for braid and leader knots"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "K-Labs Studio, Guide Train Designer geometry (K-Labs Studio v295 source dfa17b0: js/guide-train.js:61,170–175,597–598; README.md:62) | Fuji Kogyo, Stainless LG tip-top chart (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_LG_stain.pdf) | Fuji Kogyo, Torzite ring geometry (https://www.fujitackle.com/fujitackle/onlyone/torzite/)",
      "related": [
        "how-does-reel-size-influence-spinning-guide-placement",
        "what-is-the-difference-between-spinning-and-casting-guide-trains",
        "can-a-rod-be-designed-for-more-than-one-reel",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Check the assembled connection",
          "blocks": [
            {
              "type": "p",
              "text": "Tie the connection you intend to fish using the actual line and leader. Check it through the smallest running ring and tip top in both directions. Keep leader length in the test setup. A knot that remains outside the tip has a different route from one wound through the guide train before casting."
            }
          ]
        },
        {
          "heading": "Find the bottleneck",
          "blocks": [
            {
              "type": "p",
              "text": "If the knot clears every runner but snags at the tip, inspect the top separately. Compare the clear opening and entry shape instead of ordering by nominal guide number alone. A useful bench record names the knot and leader and identifies the first guide where you feel a catch."
            }
          ]
        }
      ]
    },
    {
      "id": "how-does-line-diameter-affect-a-guide-train",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "How line diameter affects a guide train",
      "summary": "Use the main line, leader and knot together when choosing guide openings or comparing two spinning setups.",
      "aliases": [
        "How does line diameter affect a guide train?"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | Fuji Kogyo, Torzite ring geometry (https://www.fujitackle.com/fujitackle/onlyone/torzite/)",
      "related": [
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "what-is-the-difference-between-spinning-and-casting-guide-trains",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Separate the two checks",
          "blocks": [
            {
              "type": "p",
              "text": "In the reduction section, look at the path from the reel through the first guides. In the running section, check the bulkiest part of the rig that actually passes through it. A fine braid can be paired with a much bulkier leader connection, so main-line diameter alone leaves out an important part of the fit."
            }
          ]
        },
        {
          "heading": "Record a comparable setup",
          "blocks": [
            {
              "type": "p",
              "text": "If a customer swaps between two lines, list each line with its intended leader and knot. Keep the reel and guide layout fixed when comparing those two rigs. For example, if only the thicker leader catches in the runners, isolate the connection before changing the entire reduction train."
            }
          ]
        }
      ]
    },
    {
      "id": "how-does-reel-size-influence-spinning-guide-placement",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "How reel size affects spinning guide placement",
      "summary": "Measure the reel in its seat and use the spool position and height when comparing reduction layouts for a spinning rod.",
      "aliases": [
        "How does reel size influence spinning-guide placement?"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | K-Labs Studio, Guide Train Designer geometry (K-Labs Studio v295 source dfa17b0: js/guide-train.js:61,170–175,597–598; README.md:62)",
      "related": [
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "what-is-the-difference-between-spinning-and-casting-guide-trains",
        "can-a-rod-be-designed-for-more-than-one-reel",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Measure the fitted reel",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the reel you will build around and note the spool diameter, its position relative to the seat and its height above the blank. Use the same reference when comparing another reel. A size label on the box does not tell you where that reel puts the spool on your particular handle assembly."
            }
          ]
        },
        {
          "heading": "Compare the reduction guides together",
          "blocks": [
            {
              "type": "p",
              "text": "Position the first guide as part of the reduction group and look through to the transition into the runners. If a taller reel changes the line approach, compare frame height as well as ring size. Treat a spacing calculator as a starting layout for the reel and guide system it describes."
            }
          ]
        }
      ]
    },
    {
      "id": "should-i-position-the-reel-seat-before-spacing-guides",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Setting reel-seat position before guide spacing",
      "summary": "Establish the reel position before laying out the guide train, and record a repeatable reference for the assembled handle.",
      "aliases": [
        "Should I position the reel seat before spacing guides?",
        "position the reel seat before spacing guides"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | K-Labs Studio, Build Layout reference measurements (K-Labs Studio v295 source dfa17b0: js/ui.js:4284–4295,17105–17153) | K-Labs Studio, Guide Train Designer geometry (K-Labs Studio v295 source dfa17b0: js/guide-train.js:61,170–175,597–598; README.md:62)",
      "related": [
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "what-is-the-difference-between-spinning-and-casting-guide-trains",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Mock up the handle first",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the intended reel in the proposed seat position before taking guide measurements. On a spinning build, moving the reel also moves the starting point for the reduction train. Record which part of the seat or reel foot you measured from so a second dry fit can reproduce it."
            }
          ]
        },
        {
          "heading": "Recheck after a handle change",
          "blocks": [
            {
              "type": "p",
              "text": "If the seat moves to make room for a longer rear grip, fit the reel again and revisit the path into the first guide before wrapping. Keep the old positions on the sketch until you have compared them with the new setup. This makes it easier to tell a genuine layout change from a shift in the measurement reference."
            }
          ]
        }
      ]
    },
    {
      "id": "should-i-use-titanium-guide-frames",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "When to choose titanium rod guide frames",
      "summary": "Compare titanium and steel frame options in the actual guide models and sizes you plan to put on the blank.",
      "aliases": [
        "Should I use titanium guide frames?",
        "use titanium guide frames"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, Titanium KB dimensional sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_KB_titanium.pdf) | Fuji Kogyo, How to read product codes (https://www.fujitackle.com/fujitackle/productcode/) | OpenStax, University Physics Volume 1, Conditions for Static Equilibrium (https://openstax.org/books/university-physics-volume-1/pages/12-1-conditions-for-static-equilibrium)",
      "related": [
        "how-do-i-choose-guide-ring-material",
        "how-do-i-select-a-tip-top-guide",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Separate frame and ring choices",
          "blocks": [
            {
              "type": "p",
              "text": "Frame material is one line on the parts list and ring material is another. Fuji KB product tables, for example, list titanium frame options separately from ceramic ring options. Check the complete part number rather than inferring frame material from the insert name or finish colour."
            }
          ]
        },
        {
          "heading": "Compare complete sets",
          "blocks": [
            {
              "type": "p",
              "text": "For a weight comparison, weigh or obtain the mass of each exact guide model, including the top. Keep the intended guide heights and openings on the same sheet so that a lighter set with a different layout is easy to spot. Record which parts are near the tip separately from the total so you can see where a substitution changes the build."
            }
          ]
        }
      ]
    },
    {
      "id": "what-does-guide-size-numbering-mean",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What fishing rod guide size numbers mean",
      "summary": "Read the catalogue dimension key before treating a guide size number as the opening available to line and knots.",
      "aliases": [
        "What does guide size numbering mean?",
        "guide size numbering mean"
      ],
      "tags": [
        "components",
        "materials"
      ],
      "source": "Fuji Kogyo, How to read product codes (https://www.fujitackle.com/fujitackle/productcode/) | Fuji Kogyo, TORZITE ring technical reference (https://www.fujitackle.com/fujitackle/onlyone/torzite/) | Fuji Kogyo, LG stainless-frame tip-top specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_LG_stain.pdf)",
      "related": [
        "how-do-i-choose-guide-ring-material",
        "how-do-i-select-a-tip-top-guide",
        "how-should-i-record-measurements-in-millimetres-and-inches"
      ],
      "sections": [
        {
          "heading": "Read the drawing",
          "blocks": [
            {
              "type": "p",
              "text": "Treat the catalogue size as a designation for that ring family. Check the clear opening and, where relevant, frame height separately. Fuji’s TORZITE documentation distinguishes the ring size from the inside opening when comparing ring designs."
            }
          ]
        },
        {
          "heading": "Write down all the dimensions you need",
          "blocks": [
            {
              "type": "p",
              "text": "When specifying a replacement, record the frame model, ring designation and relevant dimensions. A tip-top listing can include a separate pipe size. For Fuji LG, use the ring-and-pipe listing and the dimension drawing together rather than using the tube’s outside diameter as the blank fit."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-difference-between-spinning-and-casting-guide-trains",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Spinning and casting guide trains compared",
      "summary": "Identify the reel and line path before choosing guide heights or borrowing a spacing chart for a different rod type.",
      "aliases": [
        "What is the difference between spinning and casting guide trains?",
        "spinning and casting guide trains"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "can-a-rod-be-designed-for-more-than-one-reel",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Start at the reel",
          "blocks": [
            {
              "type": "p",
              "text": "A spinning reel sheds line in coils from a fixed spool. Its first guides manage those coils before the line reaches the running section. A casting reel sends line toward the stripper on a more direct path, so the tall reduction group used on many spinning rods solves a different problem."
            }
          ]
        },
        {
          "heading": "Choose a chart for the build",
          "blocks": [
            {
              "type": "p",
              "text": "If you have a casting blank and a spinning guide calculator, look for a casting reference that matches your components. Use the actual reel position and inspect the line path through the train. For both types, compare the running guide arrangement against the shape of the individual blank before making the positions permanent."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-a-choke-point-in-spinning-guide-layouts",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What a spinning guide choke point does",
      "summary": "Locate the transition from the reduction group to the running guides and check how the guides on either side work together.",
      "aliases": [
        "What is a choke point in spinning-guide layouts?",
        "a choke point in spinning-guide layouts"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, Area spinning guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/05_ariarod_spinning.pdf) | Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | K-Labs Studio, Guide Train Designer geometry (K-Labs Studio v295 source dfa17b0: js/guide-train.js:61,170–175,597–598; README.md:62)",
      "related": [
        "where-should-the-stripper-guide-sit-on-a-spinning-rod",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Identify the transition",
          "blocks": [
            {
              "type": "p",
              "text": "The choke point marks where the reduction train hands the line over to the running section. In some Fuji KR examples a running-size KB belly guide sits at that handoff. Fuji’s KR guide notes also show a layout with a separate low third reduction guide before the belly guide, so check the chart for the layout you are using."
            }
          ]
        },
        {
          "heading": "Check the neighbouring guides",
          "blocks": [
            {
              "type": "p",
              "text": "Review the approach from the last reduction guide and the exit toward the tip. If you move the transition in a mock-up, keep track of the two adjacent gaps and compare the whole path again. A layout calculator can propose a starting position when its guide series and rod type match your build."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-difference-between-reduction-guides-and-running-guides",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Reduction guides versus running guides",
      "summary": "Identify each guide by its job in the line path before ordering replacements or mixing guide families.",
      "aliases": [
        "What is the difference between reduction guides and running guides?",
        "reduction guides and running guides"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | Fuji Kogyo, Torzite ring geometry (https://www.fujitackle.com/fujitackle/onlyone/torzite/) | Fuji Kogyo, Area spinning guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/05_ariarod_spinning.pdf) | K-Labs Studio, Guide Train Designer geometry (K-Labs Studio v295 source dfa17b0: js/guide-train.js:61,170–175,597–598; README.md:62)",
      "related": [
        "where-should-the-stripper-guide-sit-on-a-spinning-rod",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Look at the reel end first",
          "blocks": [
            {
              "type": "p",
              "text": "The reduction group manages the coils leaving a spinning reel. Ring height and its position relative to the spool are part of that job. Running guides carry the line along the upper blank after the transition. They need enough clearance for the line and leader used on the rod."
            }
          ]
        },
        {
          "heading": "Match the job when replacing a guide",
          "blocks": [
            {
              "type": "p",
              "text": "Two guides with similar-looking rings can have different frame heights. If the missing part sits in the reduction group, compare the candidate with the heights of the neighbouring guides and the approach from the reel. If it sits among the runners, check the line opening and how it fits the existing group."
            }
          ]
        }
      ]
    },
    {
      "id": "what-is-the-kr-concept-guide-system",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "What the Fuji KR Concept guide system does",
      "summary": "Understand Fuji’s rapid-choke spinning layout, the roles of KL-H, KB and KT guides, and where to start a dry layout.",
      "aliases": [
        "What is the KR Concept guide system?",
        "the kr concept guide system"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | Fuji Kogyo, Area spinning guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/05_ariarod_spinning.pdf) | Fuji Kogyo, Titanium KB dimensional sheet (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/2023_KB_titanium.pdf)",
      "related": [
        "where-should-the-stripper-guide-sit-on-a-spinning-rod",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Understand the Fuji layout",
          "blocks": [
            {
              "type": "p",
              "text": "KR Concept is one Fuji approach to taking coils from a spinning spool into a low running train. The layout uses frame height as part of that reduction. Fuji’s examples use tall KL-H guides in the reduction group, KB at the belly and KT among the runners."
            }
          ]
        },
        {
          "heading": "Build from a matching reference",
          "blocks": [
            {
              "type": "p",
              "text": "Choose a Fuji reference for the actual rod and line setup. Dry fit the reduction group with the intended reel in its seat, then check the transition and running section as separate steps. The KR method is a named guide system with its own components and layout assumptions."
            }
          ]
        }
      ]
    },
    {
      "id": "where-should-the-stripper-guide-sit-on-a-spinning-rod",
      "category": "techniques",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Placing the stripper on a spinning rod",
      "summary": "Start stripper placement with the fitted reel and review the first guide as part of the whole reduction train.",
      "aliases": [
        "Where should the stripper guide sit on a spinning rod?",
        "the stripper guide sit on a spinning rod"
      ],
      "tags": [
        "guides",
        "spacing"
      ],
      "source": "Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf) | K-Labs Studio, Guide Train Designer geometry (K-Labs Studio v295 source dfa17b0: js/guide-train.js:61,170–175,597–598; README.md:62)",
      "related": [
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Set the reel reference",
          "blocks": [
            {
              "type": "p",
              "text": "Fit the intended reel before taking the first distance. Note the spool position and which face or point you measured from. A spacing figure copied from someone else’s bench needs its original reference and guide model to be useful."
            }
          ]
        },
        {
          "heading": "Compare position and height together",
          "blocks": [
            {
              "type": "p",
              "text": "Try the first guide alongside the rest of the reduction group. Look through the side profile from the spool to the transition. If the line approach looks abrupt, compare the guide’s height with the reference layout before moving it. The same nominal ring label can appear on different frame heights."
            }
          ]
        }
      ]
    },
    {
      "id": "how-should-i-select-a-surf-rod-stripper-guide",
      "category": "components",
      "status": "verified",
      "updated": "2026-11-28",
      "title": "Choosing a surf-rod stripper guide",
      "summary": "Match the first guide to the fitted surf reel and line path, then review it with the rest of the reduction group.",
      "aliases": [
        "How should I select a surf-rod stripper guide?",
        "select a surf-rod stripper guide",
        "select a surf-fishing rod stripper guide",
        "How to select a surf-rod stripper guide"
      ],
      "tags": [
        "casting",
        "lines",
        "reel",
        "matching"
      ],
      "source": "Fuji Kogyo, Surf and sport-casting reference guide specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/17_nage.pdf) | Fuji Kogyo, 2023 Reference Guide Specifications (https://www.fujitackle.com/cms-fuji/wp-content/uploads/2023/04/01_intro.pdf)",
      "related": [
        "how-does-reel-size-influence-spinning-guide-placement",
        "how-do-i-select-guides-for-braid-and-leader-knots",
        "what-is-the-difference-between-spinning-and-casting-guide-trains",
        "how-should-i-measure-guide-positions"
      ],
      "sections": [
        {
          "heading": "Identify the outfit",
          "blocks": [
            {
              "type": "p",
              "text": "Record whether the rod is for a spinning or casting reel and fit the reel the customer plans to use. On a spinning surf build, compare spool position and frame height alongside the ring opening. Casting reel layouts start from a more direct line path."
            }
          ]
        },
        {
          "heading": "Check the intended line system",
          "blocks": [
            {
              "type": "p",
              "text": "Use the actual main line and leader to check the setup. If a bulky leader knot catches farther up the rod, isolate that guide before selecting a larger stripper. Consult a guide system reference for the intended surf application and record the frame model as well as its size."
            }
          ]
        }
      ]
    },
    {
      // Verified 27 Nov 2026 under the K-Labs evidence rules: every claim is a calculation (recomputed by
      // tests/knowledge-articles.test.cjs) or a statement about Studio checked against its code. Merges two drafts.
      id:'how-do-i-convert-circumference-to-diameter',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'How to convert between diameter and circumference',
      summary:'Circumference is diameter multiplied by pi, and diameter is circumference divided by pi. Worked examples, rounding, and shapes that are not round.',
      aliases:['How do I convert circumference to diameter','convert circumference to diameter','How to convert circumference to diameter',
        'How do I calculate circumference from diameter','calculate circumference from diameter','How to calculate circumference from diameter'],
      tags:['diameter','circumference','pi','measurement','calculator','blank','grip'],
      source:'Mathematics: pi is the ratio of a circle\'s circumference to its diameter. The worked examples are recalculated by K-Labs automated tests.',
      related:['how-should-i-record-measurements-in-millimetres-and-inches','why-do-calculations-differ-from-measurements-on-the-rod','how-do-i-verify-a-printed-wrap-template-is-to-scale'],
      sections:[
        {heading:'The formulas',blocks:[
          {type:'p',text:'Pi (π) is the ratio of any circle\'s circumference to its diameter, about 3.14159. So:'},
          {type:'list',items:['Circumference = π × diameter','Diameter = circumference ÷ π']},
          {type:'p',text:'Use the same unit for both. The answer is in the unit you measured in: millimetres in, millimetres out.'}
        ]},
        {heading:'Worked examples',blocks:[
          {type:'list',items:[
            'A blank 12.0 mm in diameter: 12.0 × π = 37.70 mm around.',
            'A grip that measures 100 mm around: 100 ÷ π = 31.83 mm in diameter.',
            'A blank 0.500 in in diameter: 0.500 × π = 1.571 in around.'
          ]}
        ]},
        {heading:'Rounding',blocks:[
          {type:'p',text:'Keep π to at least 3.1416 and round only the final answer. Using 3.14 puts every result about 0.05% out, which is 0.02 mm on the circumference of a 12 mm blank.'}
        ]},
        {heading:'Shapes that are not round',blocks:[
          {type:'p',text:'The formulas describe circles only. For an oval or irregular section, circumference ÷ π gives the diameter of a circle with the same distance around, not the section\'s actual width in any direction.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'Workshop → Diameter & Circumference converts either way: enter one value and Studio calculates the other, in the measurement units chosen in Settings.'}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): NIST definition of the inch, calculations recomputed by
      // tests/knowledge-articles.test.cjs, and Studio statements checked against its code. Merges two drafts.
      id:'how-should-i-record-measurements-in-millimetres-and-inches',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'Recording rod measurements in millimetres and inches',
      summary:'One inch is exactly 25.4 mm. Label every figure with its unit and the point it is measured from, and convert from the original measurement.',
      aliases:['How should I record measurements in millimetres and inches','convert inches to millimetres','convert millimetres to inches',
        'inches to mm','mm to inches','How do I prevent inconsistent measurements across a build','inconsistent measurements'],
      tags:['measurement','units','millimetres','inches','conversion','reference point'],
      source:'NIST, "SI Units – Length": the inch is exactly equivalent to 25.4 mm, effective 1 July 1959. The worked figures are recalculated by K-Labs automated tests; the Studio statements are checked against Studio itself.',
      related:['how-do-i-convert-circumference-to-diameter','how-should-i-measure-guide-positions','why-do-calculations-differ-from-measurements-on-the-rod'],
      sections:[
        {heading:'The exact conversion',blocks:[
          {type:'p',text:'Since 1959 the inch has been defined as exactly 25.4 mm, so converting between the two is exact arithmetic:'},
          {type:'list',items:['Millimetres = inches × 25.4','Inches = millimetres ÷ 25.4']}
        ]},
        {heading:'Worked examples',blocks:[
          {type:'list',items:[
            'A 7 ft rod is 84 in: 84 × 25.4 = 2133.6 mm.',
            'A 300 mm grip: 300 ÷ 25.4 = 11.811 in.',
            'Fractions convert exactly too: 1/8 in = 0.125 in = 3.175 mm, and 5/16 in = 0.3125 in = 7.9375 mm.'
          ]}
        ]},
        {heading:'Convert once, from the original',blocks:[
          {type:'p',text:'Rounding before converting adds error. 300 mm rounded to 11.8 in converts back to 299.72 mm, 0.28 mm short. Keep the figure you measured and convert from that, rounding only the result.'}
        ]},
        {heading:'Label the unit and the reference point',blocks:[
          {type:'p',text:'A length means nothing without the point it is measured from. On a 2133.6 mm rod, a position 300 mm from the tip is 1833.6 mm from the butt. Write the unit, the end it is measured from, and whether a fraction or a decimal was used beside every figure.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'Settings → Measurement Units offers Metric (mm), Decimal Inches and Fractional Inches. Guide Setup lists guide positions from the tip; a build\'s reel seat position is recorded from the butt.'}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): calculations recomputed by tests; Studio statement checked against its code. Merges two drafts.
      id:'how-should-i-measure-guide-positions',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'How to measure guide positions and spacing',
      summary:'Measure every guide from the same end of the rod to the same point on each guide. Spacing is then the difference between neighbouring positions.',
      aliases:['How should I measure guide positions','What does effective guide spacing mean','guide spacing','measure guide spacing',
        'guide positions from the tip','effective guide spacing'],
      tags:['guides','guide spacing','layout','measurement','reference point'],
      source:'Arithmetic on positions measured from one end of the rod. The worked figures are recalculated by K-Labs automated tests; the Studio statement is checked against Studio itself.',
      related:['how-should-i-record-measurements-in-millimetres-and-inches','why-do-calculations-differ-from-measurements-on-the-rod'],
      sections:[
        {heading:'Position and spacing',blocks:[
          {type:'p',text:'A guide\'s position is its distance from one fixed end of the rod. The spacing between two guides is the difference between their positions. For guides at 110, 235 and 380 mm from the tip:'},
          {type:'list',items:['Tip to guide 1: 110 mm','Guide 1 to guide 2: 235 − 110 = 125 mm','Guide 2 to guide 3: 380 − 235 = 145 mm']}
        ]},
        {heading:'Use the same point on every guide',blocks:[
          {type:'p',text:'Measure to the same feature on every guide, such as the ring centre. If one guide is measured to its foot instead, both spacings next to it are wrong by the distance from foot to ring centre: one too long, the other too short.'}
        ]},
        {heading:'From the tip or from the butt',blocks:[
          {type:'p',text:'The two are linked by the rod\'s length: distance from the butt = rod length − distance from the tip. On a 2100 mm rod, a guide 380 mm from the tip is 1720 mm from the butt. Spacings come out the same either way, but a list that mixes the two does not add up.'}
        ]},
        {heading:'Comparing two layouts',blocks:[
          {type:'p',text:'Before comparing guide tables from different sources, check that both measure from the same end, to the same point on each guide, in the same unit. Otherwise one rod can look like two different layouts.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'Workshop → Guide Setup lists each guide\'s position measured from the tip, in the measurement units chosen in Settings.'}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): calculations recomputed by tests; Studio template statements checked against its code.
      id:'how-do-i-verify-a-printed-wrap-template-is-to-scale',
      category:'techniques',
      status:'verified',
      updated:'2026-11-27',
      title:'How to check a printed wrap template is to scale',
      summary:'For a full-circumference template, compare its printed width with the stated circumference. For a diamond marking guide, measure along a mark column.',
      aliases:['How do I verify a printed wrap template is to scale','print template at 100%','printed template wrong size','wrap template scale','actual size printing'],
      tags:['thread wrap','template','printing','scale','circumference','Thread Design Studio'],
      source:'Arithmetic: a full-size wrap template is one circumference wide. The worked figures are recalculated by K-Labs automated tests; the Thread Design Studio statements are checked against Studio itself.',
      related:['how-do-i-convert-circumference-to-diameter'],
      sections:[
        {heading:'Why the width matters',blocks:[
          {type:'p',text:'A full-circumference wrapping template is drawn one circumference wide. Print scaling changes the dimensions of that pattern. A diamond marking guide is a different layout, with two columns of axial marks. Its page width does not represent the rod circumference.'}
        ]},
        {heading:'The check',blocks:[
          {type:'steps',items:[
            'Print with page scaling turned off (actual size, or 100%).',
            'On a full-circumference template, measure the outlined pattern width with a ruler.',
            'Compare that width with the printed circumference, allowing for rounding on the label.'
          ]}
        ]},
        {heading:'Working out the scale',blocks:[
          {type:'p',text:'Scale = measured width ÷ stated circumference × 100. A template stating 37.7 mm that measures 35.8 mm is approximately 95% of actual size. Reprint with scaling turned off rather than correcting by hand.'}
        ]},
        {heading:'In Studio',blocks:[
          {type:'p',text:'The grid wrapping template in Thread Design Studio prints the rod diameter, circumference and mark spacing. Its outlined pattern is one circumference wide. On the diamond marking guide, compare the distance between two consecutive marks in the same column with the printed crossing spacing. Use actual size for both.'}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): every figure is a calculation recomputed by tests.
      id:'why-do-calculations-differ-from-measurements-on-the-rod',
      category:'troubleshooting',
      status:'verified',
      updated:'2026-11-27',
      title:'Why calculated and measured figures differ',
      summary:'Rounded inputs, mixed units and different reference points make a correct calculation disagree with the rod. Check each before doubting the formula.',
      aliases:['Why do calculations differ from measurements on the rod','calculation does not match measurement','calculator wrong','measurement mismatch'],
      tags:['measurement','calculator','rounding','units','reference point'],
      source:'Arithmetic. The worked figures are recalculated by K-Labs automated tests.',
      related:['how-should-i-record-measurements-in-millimetres-and-inches','how-should-i-measure-guide-positions','how-do-i-convert-circumference-to-diameter'],
      sections:[
        {heading:'Inputs that are slightly off',blocks:[
          {type:'p',text:'A calculation is only as close as its inputs. A blank measured as 12.0 mm that is really 12.1 mm gives a circumference of 37.70 mm instead of 38.01 mm: 0.31 mm short.'}
        ]},
        {heading:'Mixed units',blocks:[
          {type:'p',text:'A figure in inches read as millimetres is 25.4 times too small: 12 in is 304.8 mm, not 12 mm. Errors this large usually mean a unit mix-up.'}
        ]},
        {heading:'Different reference points',blocks:[
          {type:'p',text:'Distances measured from opposite ends are complements: distance from the butt = rod length − distance from the tip. On a 2100 mm rod, guides 380 mm and 500 mm from the tip are 1720 mm and 1600 mm from the butt. Convert each position before comparing. A constant difference instead suggests checking for a displaced zero or a consistently different measurement point.'}
        ]},
        {heading:'Check in this order',blocks:[
          {type:'steps',items:[
            'Confirm both figures are in the same unit.',
            'Confirm both are measured from the same end and to the same point.',
            'Re-measure the inputs, then recalculate from the new figures.'
          ]}
        ]}
      ]
    },
    {
      // Verified 27 Nov 2026 (batch 01): every figure is a calculation recomputed by tests.
      id:'how-should-i-compare-component-cost-and-selling-price',
      category:'faqs',
      status:'verified',
      updated:'2026-11-27',
      title:'Margin and markup: what is the difference?',
      summary:'Markup is profit as a share of the cost; margin is profit as a share of the selling price. The same sale gives two different percentages.',
      aliases:['How should I compare component cost and selling price','margin vs markup','markup vs margin','markup percentage','margin percentage','price for a target margin'],
      tags:['pricing','margin','markup','profit','cost','tax'],
      source:'Arithmetic. The worked figures are recalculated by K-Labs automated tests.',
      related:[],
      sections:[
        {heading:'The formulas',blocks:[
          {type:'list',items:['Profit = selling price − cost','Markup = profit ÷ cost × 100','Margin = profit ÷ selling price × 100']}
        ]},
        {heading:'Worked example',blocks:[
          {type:'p',text:'A component bought for $40 and sold for $60 makes $20 profit. That is a 50% markup but a 33.3% margin.'}
        ]},
        {heading:'Converting between them',blocks:[
          {type:'list',items:['Margin = markup ÷ (100 + markup) × 100','Markup = margin ÷ (100 − margin) × 100']},
          {type:'p',text:'A 50% markup is a 33.3% margin, and a 50% margin needs a 100% markup.'}
        ]},
        {heading:'Pricing for a target margin',blocks:[
          {type:'p',text:'Selling price = cost ÷ (1 − margin ÷ 100). For a 40% margin on a $40 cost: $40 ÷ 0.6 = $66.67.'}
        ]},
        {heading:'Leave tax out of both figures',blocks:[
          {type:'p',text:'Compare like with like. If the selling price includes a sales tax such as GST, take the tax out before working out margin or markup: at a 15% rate, a $69.00 tax-inclusive price is $60.00 before tax.'}
        ]}
      ]
    }
  ]);


  // ---------- search ----------
  const SYNONYMS=Object.freeze({reelseat:'reel seat',reelseats:'reel seat',crosswrap:'cross wrap',buttwrap:'butt wrap',
    'fore grip':'foregrip','x wrap':'cross wrap',seats:'seat',guides:'guide',grips:'grip',wraps:'wrap'});
  function normalise(text){
    let value=String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
      .replace(/[^a-z0-9°]+/g,' ').trim();
    for(const [from,to] of Object.entries(SYNONYMS))value=value.replace(new RegExp(`\\b${from}\\b`,'g'),to);
    return value.replace(/\s+/g,' ');
  }
  function tokens(query){
    return normalise(query).split(' ').filter((t)=>t.length>0);
  }
  function articleBody(article){
    return article.sections.map((s)=>[s.heading,...s.blocks.map((b)=>b.text||(b.items||[]).join(' '))].join(' ')).join(' ');
  }
  // Studio's articles: the verified ones, plus drafts for local review when present (never on the live site).
  let drafts=[];
  let all=ARTICLES;
  function buildIndex(list){
    return list.map((article)=>({
      article,
      title:normalise(article.title),
      aliases:normalise((article.aliases||[]).join(' | ')),
      tags:normalise((article.tags||[]).join(' ')),
      summary:normalise(article.summary),
      body:normalise(articleBody(article))
    }));
  }
  let INDEX=buildIndex(all);
  function useDrafts(list){
    const ids=new Set(ARTICLES.map((a)=>a.id));
    drafts=Object.freeze((Array.isArray(list)?list:[]).filter((a)=>a && a.id && a.status!=='verified' && !ids.has(a.id)));
    all=Object.freeze([...ARTICLES,...drafts]);
    INDEX=buildIndex(all);
    return drafts.length;
  }
  function articles(){
    return all;
  }
  // Every word of the query must appear somewhere (title, tags, summary or body); title words count most.
  function search(query){
    const words=tokens(query);
    if(!words.length)return [];
    const results=[];
    for(const entry of INDEX){
      let score=0;
      let all=true;
      for(const word of words){
        const has=(field)=>(` ${entry[field]}`).includes(` ${word}`);
        const wordScore=(has('title')?8:0)+(has('aliases')?6:0)+(has('tags')?5:0)+(has('summary')?3:0)+(has('body')?1:0);
        if(!wordScore){all=false;break;}
        score+=wordScore;
      }
      if(all)results.push({article:entry.article,score});
    }
    return results.sort((a,b)=>b.score-a.score||a.article.title.localeCompare(b.article.title));
  }
  function articlesIn(categoryId){
    return all.filter((a)=>a.category===categoryId);
  }
  function categoryOf(article){
    return CATEGORIES.find((c)=>c.id===article.category)||{title:''};
  }
  function readMinutes(article){
    const words=(article.title+' '+article.summary+' '+articleBody(article)).split(/\s+/).length;
    return Math.max(1,Math.round(words/200));
  }

  // ---------- rendering ----------
  const states=new WeakMap();
  function el(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  // Text with the query's words marked (textContent only).
  function marked(tag,className,text,query){
    const node=el(tag,className);
    const words=tokens(query).filter((w)=>w.length>1);
    const source=String(text||'');
    if(!words.length){node.textContent=source;return node;}
    const folded=source.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    const ranges=[];
    for(const word of words){
      for(const part of word.split(' ')){
        let from=0;
        let at;
        while(part && (at=folded.indexOf(part,from))!==-1){ranges.push([at,at+part.length]);from=at+part.length;}
      }
    }
    ranges.sort((a,b)=>a[0]-b[0]);
    let cursor=0;
    for(const [start,end] of ranges){
      if(start<cursor)continue;
      if(start>cursor)node.appendChild(document.createTextNode(source.slice(cursor,start)));
      node.appendChild(el('mark','knowledge-mark',source.slice(start,end)));
      cursor=end;
    }
    if(cursor<source.length)node.appendChild(document.createTextNode(source.slice(cursor)));
    return node;
  }
  function backButton(label,onClick){
    const button=el('button','workshop-tool-nav-back knowledge-back');
    button.type='button';
    button.setAttribute('aria-label',`Back to ${label}`);
    button.appendChild(el('span','workshop-tool-nav-back__arrow','‹')).setAttribute('aria-hidden','true');
    button.appendChild(el('span','',label.toUpperCase()));
    button.addEventListener('click',onClick);
    return button;
  }
  function articleRow(article,query,host,from){
    const row=el('button','workshop-tool-launch workshop-tool-launch--landing knowledge-row');
    row.type='button';
    row.setAttribute('data-knowledge-article',article.id);
    const head=el('span','knowledge-row__head');
    head.appendChild(marked('span','workshop-tool-launch__title knowledge-row__title',article.title,query));
    if(article.status!=='verified')head.appendChild(el('span','knowledge-status','Draft'));
    row.appendChild(head);
    row.appendChild(marked('span','workshop-tool-launch__meta',article.summary,query));
    row.appendChild(el('span','knowledge-row__detail',`${categoryOf(article).title} · ${readMinutes(article)} min read`));
    row.addEventListener('click',()=>show(host,{view:'article',articleId:article.id,from}));
    return row;
  }
  function renderHome(host,state,body){
    const list=el('div','knowledge-list');
    list.setAttribute('aria-label','Knowledge Base categories');
    for(const category of CATEGORIES){
      const count=articlesIn(category.id).length;
      const row=el('button','workshop-tool-launch workshop-tool-launch--landing knowledge-row');
      row.type='button';
      row.setAttribute('data-knowledge-category',category.id);
      row.appendChild(el('span','workshop-tool-launch__title',category.title));
      row.appendChild(el('span','workshop-tool-launch__meta',category.meta));
      row.appendChild(el('span','knowledge-row__detail',count?`${count} ${count===1?'article':'articles'}`:'No articles yet'));
      row.addEventListener('click',()=>show(host,{view:'category',categoryId:category.id}));
      list.appendChild(row);
    }
    body.appendChild(list);
  }
  function renderResults(host,state,body){
    const results=search(state.query);
    const status=el('p','knowledge-count');
    status.setAttribute('role','status');
    status.textContent=results.length
      ?`${results.length} ${results.length===1?'article':'articles'} for “${state.query.trim()}”`
      :`Nothing matches “${state.query.trim()}”. Try reel seat, repair or cross wrap.`;
    body.appendChild(status);
    const list=el('div','knowledge-list');
    for(const {article} of results)list.appendChild(articleRow(article,state.query,host,{view:'home',query:state.query}));
    body.appendChild(list);
  }
  function renderCategory(host,state,body){
    const category=CATEGORIES.find((c)=>c.id===state.categoryId)||CATEGORIES[0];
    body.appendChild(backButton('Knowledge Base',()=>show(host,{view:'home'})));
    body.appendChild(el('h4','knowledge-heading',category.title));
    const articles=articlesIn(category.id);
    if(!articles.length){
      body.appendChild(el('p','knowledge-count','No articles in this category yet.'));
      return;
    }
    const list=el('div','knowledge-list');
    for(const article of articles)list.appendChild(articleRow(article,'',host,{view:'category',categoryId:category.id}));
    body.appendChild(list);
  }
  // Link the named primary guidance where readers need it to apply the article.
  function articleParagraph(articleId,text){
    if(articleId!=='how-should-i-prepare-a-customer-facing-invoice')return [{text}];
    const label='Inland Revenue’s taxable supply information guidance';
    const start=text.indexOf(label);
    if(start<0)return [{text}];
    return [
      {text:text.slice(0,start)},
      {text:label,href:'https://www.ird.govt.nz/gst/tax-invoices-for-gst/how-tax-invoices-for-gst-work'},
      {text:text.slice(start+label.length)},
    ];
  }
  function renderArticle(host,state,body){
    const article=all.find((a)=>a.id===state.articleId);
    if(!article){show(host,{view:'home'});return;}
    const from=state.from||{view:'home'};
    const backLabel=from.view==='category'?(CATEGORIES.find((c)=>c.id===from.categoryId)||{title:'Knowledge Base'}).title:(from.query?'Results':'Knowledge Base');
    body.appendChild(backButton(backLabel,()=>show(host,from)));
    const doc=el('article','knowledge-article');
    doc.setAttribute('data-knowledge-reader',article.id);
    doc.appendChild(el('p','knowledge-article__kicker',`${categoryOf(article).title} · ${readMinutes(article)} min read`));
    doc.appendChild(el('h4','knowledge-article__title',article.title));
    if(article.status!=='verified'){
      const draft=el('p','knowledge-article__draft');
      draft.setAttribute('data-knowledge-draft','');
      draft.appendChild(el('strong','','Draft · Unverified. '));
      draft.appendChild(document.createTextNode('Not yet reviewed by K-Labs. Do not rely on it for customer work.'));
      doc.appendChild(draft);
    }
    const brief=el('div','knowledge-article__brief');
    brief.appendChild(el('span','knowledge-article__label','In brief'));
    brief.appendChild(el('p','',article.summary));
    doc.appendChild(brief);
    for(const section of article.sections){
      const part=el('section','knowledge-article__section');
      part.appendChild(el('h5','knowledge-article__heading',section.heading));
      for(const block of section.blocks){
        if(block.type==='p'){
          const paragraph=el('p');
          for(const {text,href} of articleParagraph(article.id,block.text)){
            if(href){
              const link=el('a','knowledge-article__citation',text);
              link.href=href;
              paragraph.appendChild(link);
            }else paragraph.appendChild(document.createTextNode(text));
          }
          part.appendChild(paragraph);
        }
        else if(block.type==='caution'){
          const caution=el('p','knowledge-article__caution');
          caution.appendChild(el('strong','','Caution. '));
          caution.appendChild(document.createTextNode(block.text));
          part.appendChild(caution);
        }else{
          const list=el(block.type==='steps'?'ol':'ul',block.type==='steps'?'knowledge-article__steps':'knowledge-article__list');
          for(const item of block.items)list.appendChild(el('li','',item));
          part.appendChild(list);
        }
      }
      doc.appendChild(part);
    }
    const related=(article.related||[]).map((id)=>all.find((a)=>a.id===id)).filter(Boolean);
    if(related.length){
      const part=el('section','knowledge-article__section');
      part.appendChild(el('h5','knowledge-article__heading','Related'));
      const list=el('div','knowledge-related');
      for(const other of related){
        const card=el('button','knowledge-related__card',other.title);
        card.type='button';
        card.setAttribute('data-knowledge-article',other.id);
        card.addEventListener('click',()=>show(host,{view:'article',articleId:other.id,from}));
        list.appendChild(card);
      }
      part.appendChild(list);
      doc.appendChild(part);
    }
    body.appendChild(doc);
  }
  function render(host){
    const state=states.get(host);
    if(!state)return;
    const searchWrap=host.querySelector('[data-knowledge-search-wrap]');
    if(searchWrap)searchWrap.hidden=state.view==='article'||state.view==='category';
    const body=host.querySelector('[data-knowledge-body]');
    body.replaceChildren();
    const searching=state.view==='home' && state.query.trim();
    if(state.view==='article')renderArticle(host,state,body);
    else if(state.view==='category')renderCategory(host,state,body);
    else if(searching)renderResults(host,state,body);
    else renderHome(host,state,body);
  }
  function show(host,next){
    const state=states.get(host);
    if(!state)return;
    state.view=next.view||'home';
    state.categoryId=next.categoryId||'';
    state.articleId=next.articleId||'';
    state.from=next.from||null;
    if(next.view==='home')state.query=next.query!==undefined?next.query:'';
    const input=host.querySelector('[data-knowledge-search]');
    if(input && input.value!==state.query)input.value=state.query;
    render(host);
    const card=host.closest('.workshop-tool-card')||host;
    if(next.view!=='home' || next.scroll!==false){
      try{card.scrollIntoView({block:'start'});}catch{}
    }
  }
  // Local review: on this computer only (file:, localhost, 127.0.0.1, 0.0.0.0), Studio asks once for the git-ignored
  // drafts file. The live site never requests it, and it cannot be deployed because it is never committed.
  const LOCAL_DRAFTS='js/knowledge-drafts.local.js';
  function isLocalReviewHost(location){
    if(!location)return false;
    return location.protocol==='file:' || ['localhost','127.0.0.1','0.0.0.0'].includes(location.hostname);
  }
  let localDrafts=null;
  function loadLocalDrafts(){
    if(localDrafts)return localDrafts;
    const doc=typeof document!=='undefined'?document:null;
    if(!doc || !isLocalReviewHost(typeof location!=='undefined'?location:null)){localDrafts=Promise.resolve(0);return localDrafts;}
    localDrafts=new Promise((resolve)=>{
      const script=doc.createElement('script');
      script.src=LOCAL_DRAFTS;
      script.onload=()=>resolve(useDrafts(typeof window!=='undefined'?window.KLabsKnowledgeDrafts:[]));
      script.onerror=()=>resolve(0);
      doc.head.appendChild(script);
    });
    return localDrafts;
  }
  function mount(host){
    if(!host || states.has(host))return;
    loadLocalDrafts().then((count)=>{if(count && states.has(host))render(host);});
    states.set(host,{view:'home',query:'',categoryId:'',articleId:'',from:null});
    host.replaceChildren();
    const searchWrap=el('div','knowledge-search');
    searchWrap.setAttribute('data-knowledge-search-wrap','');
    const input=el('input','studio-components-shell__search knowledge-search__input');
    input.type='search';
    input.placeholder='Search the Knowledge Base';
    input.autocomplete='off';
    input.spellcheck=false;
    input.setAttribute('enterkeyhint','search');
    input.setAttribute('aria-label','Search the Knowledge Base');
    input.setAttribute('data-knowledge-search','');
    input.addEventListener('input',()=>{
      const state=states.get(host);
      state.query=input.value;
      state.view='home';
      render(host);
    });
    input.addEventListener('keydown',(event)=>{if(event.key==='Enter')input.blur();});
    searchWrap.appendChild(input);
    host.appendChild(searchWrap);
    const body=el('div','knowledge-body');
    body.setAttribute('data-knowledge-body','');
    host.appendChild(body);
    render(host);
  }
  function unmount(host){
    if(!host || !states.has(host))return;
    states.delete(host);
    host.replaceChildren();
  }
  function isMounted(host){
    return !!host && states.has(host);
  }
  return Object.freeze({CATEGORIES,ARTICLES,articles,useDrafts,isLocalReviewHost,normalise,search,readMinutes,articleParagraph,marked,mount,unmount,isMounted,show});
});
