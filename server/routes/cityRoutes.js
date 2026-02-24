const express = require('express');
const { addCity, getCities, toggleFavorite, deleteCity } = require('../controllers/cityController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, addCity);
router.get('/', authMiddleware, getCities);
router.put('/:id/favorite', authMiddleware, toggleFavorite);
router.delete('/:id', authMiddleware, deleteCity);

module.exports = router;
