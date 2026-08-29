# Free Convention Calendar for Wix Harmony

A static, auto-updating convention calendar designed to be embedded in Wix Harmony.

## Cost
$0 recurring cost when hosted in a public GitHub repository with GitHub Pages and GitHub Actions.

## How it works
A scheduled GitHub Action runs `scripts/update-events.mjs`, reads public convention-center calendar pages, writes `data/events.json`, and deploys the static site to GitHub Pages.

The front end is plain HTML/CSS/JavaScript and does not require Wix Velo.

## Privacy / access
This repository does not need access to Wix, customer records, payments, contacts, forms, or private business data. Do not add credentials to this repository.

## Resilience
If an official source cannot be parsed during a refresh, the updater keeps that source's last known unexpired events instead of erasing them. The website also links directly to every official venue calendar.

See `SETUP_FOR_WIX_HARMONY.txt` for installation steps.
