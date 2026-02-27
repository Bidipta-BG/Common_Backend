const { Granth, Chapter, Verse } = require('../models');

/**
 * GET /api/srikrishna-aarti/granth
 * Returns all granths
 */
exports.getGranthList = async (req, res, next) => {
    try {
        const granths = await Granth.find().sort({ createdAt: 1 });

        const formattedGranths = granths.map(g => ({
            id: g.bookId,
            title: g.title,
            titleHi: g.titleHi,
            description: g.description,
            descriptionHi: g.descriptionHi,
            image_url: g.image_url
        }));

        res.status(200).json(formattedGranths);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/srikrishna-aarti/granth/:bookId
 * Returns chapters and verses tree for a book
 */
exports.getGranthTree = async (req, res, next) => {
    try {
        const { bookId } = req.params;

        const chapters = await Chapter.find({ bookId }).sort({ index: 1 });
        const verses = await Verse.find({ bookId }).sort({ chapterIndex: 1, index: 1 });

        const formattedChapters = chapters.map(ch => ({
            id: `${bookId}_${String(ch.index).padStart(2, '0')}`,
            index: ch.index,
            title: ch.title,
            titleHi: ch.titleHi,
            verses: verses
                .filter(v => v.chapterIndex === ch.index)
                .map(v => ({
                    id: v.verseId,
                    index: v.index
                }))
        }));

        res.status(200).json({
            bookId,
            chapters: formattedChapters
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/srikrishna-aarti/granth/verse/:verseId
 * Returns full detail for a verse
 */
exports.getVerseDetail = async (req, res, next) => {
    try {
        const { verseId } = req.params;
        const verse = await Verse.findOne({ verseId });

        if (!verse) {
            return res.status(404).json({ success: false, message: 'Verse not found' });
        }

        res.status(200).json({
            id: verse.verseId,
            index: verse.index,
            chapter: verse.chapterText,
            chapterHi: verse.chapterTextHi,
            sans: verse.sans,
            en: verse.en,
            hi: verse.hi,
            timer: verse.timer
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/granth
 * Add or update a Granth
 */
exports.updateGranth = async (req, res, next) => {
    try {
        const { bookId, title, titleHi, description, descriptionHi, image_url } = req.body;

        const granth = await Granth.findOneAndUpdate(
            { bookId },
            { title, titleHi, description, descriptionHi, image_url },
            { upsert: true, new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: granth });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/granth/chapter
 * Add or update a Chapter
 */
exports.updateChapter = async (req, res, next) => {
    try {
        const { bookId, index, title, titleHi } = req.body;

        const granth = await Granth.findOne({ bookId });
        if (!granth) {
            return res.status(404).json({ success: false, message: 'Granth not found' });
        }

        const chapter = await Chapter.findOneAndUpdate(
            { bookId, index },
            { granth: granth._id, bookId, index, title, titleHi },
            { upsert: true, new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: chapter });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/srikrishna-aarti/granth/verse
 * Add or update a Verse
 */
exports.updateVerse = async (req, res, next) => {
    try {
        const { verseId, bookId, chapterIndex, index, chapterText, chapterTextHi, sans, en, hi, timer } = req.body;

        const chapter = await Chapter.findOne({ bookId, index: chapterIndex });
        if (!chapter) {
            return res.status(404).json({ success: false, message: 'Chapter not found' });
        }

        const verse = await Verse.findOneAndUpdate(
            { verseId },
            {
                chapter: chapter._id,
                verseId,
                bookId,
                chapterIndex,
                index,
                chapterText,
                chapterTextHi,
                sans,
                en,
                hi,
                timer
            },
            { upsert: true, new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: verse });
    } catch (error) {
        next(error);
    }
};
