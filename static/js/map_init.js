$(function () {
  function formatState (state) {
    if (!state.id) {
      return state.text
    }
    var $state = $(
      '<span><i class="pokemon-sprite n' + state.element.value.toString() + '"></i> ' + state.text + '</span>'
    )
    return $state
  }

  if (Store.get('startAtUserLocation')) {
    centerMapOnLocation()
  }

  $selectExclude = $('#exclude-pokemon')
  $selectPokemonNotify = $('#notify-pokemon')
  $selectRarityNotify = $('#notify-rarity')
  var numberOfPokemon = 151

  // Load pokemon names and populate lists
  $.getJSON('static/dist/data/pokemon.min.json').done(function (data) {
    var pokeList = []

    $.each(data, function (key, value) {
      if (key > numberOfPokemon) {
        return false
      }
      var _types = []
      pokeList.push({
        id: key,
        text: i8ln(value['name']) + ' - #' + key
      })
      value['name'] = i8ln(value['name'])
      value['rarity'] = i8ln(value['rarity'])
      $.each(value['types'], function (key, pokemonType) {
        _types.push({
          'type': i8ln(pokemonType['type']),
          'color': pokemonType['color']
        })
      })
      value['types'] = _types
      idToPokemon[key] = value
    })

    // setup the filter lists
    $selectExclude.select2({
      placeholder: i8ln('Select Pokémon'),
      data: pokeList,
      templateResult: formatState
    })
    $selectPokemonNotify.select2({
      placeholder: i8ln('Select Pokémon'),
      data: pokeList,
      templateResult: formatState
    })
    $selectRarityNotify.select2({
      placeholder: i8ln('Select Rarity'),
      data: [i8ln('Common'), i8ln('Uncommon'), i8ln('Rare'), i8ln('Very Rare'), i8ln('Ultra Rare')],
      templateResult: formatState
    })

    // setup list change behavior now that we have the list to work from
    $selectExclude.on('change', function (e) {
      excludedPokemon = $selectExclude.val().map(Number)
      clearStaleMarkers()
      Store.set('remember_select_exclude', excludedPokemon)
    })
    $selectPokemonNotify.on('change', function (e) {
      notifiedPokemon = $selectPokemonNotify.val().map(Number)
      Store.set('remember_select_notify', notifiedPokemon)
    })
    $selectRarityNotify.on('change', function (e) {
      notifiedRarity = $selectRarityNotify.val().map(String)
      Store.set('remember_select_rarity_notify', notifiedRarity)
    })

    // recall saved lists
    $selectExclude.val(Store.get('remember_select_exclude')).trigger('change')
    $selectPokemonNotify.val(Store.get('remember_select_notify')).trigger('change')
    $selectRarityNotify.val(Store.get('remember_select_rarity_notify')).trigger('change')

    if (isTouchDevice()) {
      $('.select2-search input').prop('readonly', true)
    }
  })

  // run interval timers to regularly update map and timediffs
  window.setInterval(updateLabelDiffTime, 1000)
  window.setInterval(updateMap, 5000)
  window.setInterval(function () {
    if (navigator.geolocation && (Store.get('geoLocate') || Store.get('followMyLocation'))) {
      navigator.geolocation.getCurrentPosition(function (position) {
        var lat = position.coords.latitude
        var lng = position.coords.longitude
        var center = new google.maps.LatLng(lat, lng)

        if (Store.get('geoLocate')) {
          // the search function makes any small movements cause a loop. Need to increase resolution
          if ((typeof searchMarker !== 'undefined') && (getPointDistance(searchMarker.getPosition(), center) > 40)) {
            $.post('next_loc?lat=' + lat + '&lon=' + lng).done(function () {
              map.panTo(center)
              searchMarker.setPosition(center)
            })
          }
        }
        if (Store.get('followMyLocation')) {
          if ((typeof locationMarker !== 'undefined') && (getPointDistance(locationMarker.getPosition(), center) >= 5)) {
            map.panTo(center)
            locationMarker.setPosition(center)
            Store.set('followMyLocationPosition', { lat: lat, lng: lng })
          }
        }
      })
    }
  }, 1000)

  // Wipe off/restore map icons when switches are toggled
  function buildSwitchChangeListener (data, dataType, storageKey) {
    return function () {
      Store.set(storageKey, this.checked)
      if (this.checked) {
        updateMap()
      } else {
        $.each(dataType, function (d, dType) {
          $.each(data[dType], function (key, value) {
            // for any marker you're turning off, you'll want to wipe off the range
            if (data[dType][key].marker.rangeCircle) {
              data[dType][key].marker.rangeCircle.setMap(null)
              delete data[dType][key].marker.rangeCircle
            }
            if (storageKey !== 'showRanges') data[dType][key].marker.setMap(null)
          })
          if (storageKey !== 'showRanges') data[dType] = {}
        })
        if (storageKey === 'showRanges') {
          updateMap()
        }
      }
    }
  }

  // Setup UI element interactions
  $('#gyms-switch').change(buildSwitchChangeListener(mapData, ['gyms'], 'showGyms'))
  $('#pokemon-switch').change(buildSwitchChangeListener(mapData, ['pokemons'], 'showPokemon'))
  $('#scanned-switch').change(buildSwitchChangeListener(mapData, ['scanned'], 'showScanned'))
  $('#spawnpoints-switch').change(buildSwitchChangeListener(mapData, ['spawnpoints'], 'showSpawnpoints'))
  $('#ranges-switch').change(buildSwitchChangeListener(mapData, ['gyms', 'pokemons', 'pokestops'], 'showRanges'))

  $('#pokestops-switch').change(function () {
    var options = {
      'duration': 500
    }
    var wrapper = $('#lured-pokestops-only-wrapper')
    if (this.checked) {
      wrapper.show(options)
    } else {
      wrapper.hide(options)
    }
    return buildSwitchChangeListener(mapData, ['pokestops'], 'showPokestops').bind(this)()
  })

  $('#sound-switch').change(function () {
    Store.set('playSound', this.checked)
  })

  $('#geoloc-switch').change(function () {
    $('#next-location').prop('disabled', this.checked)
    $('#next-location').css('background-color', this.checked ? '#e0e0e0' : '#ffffff')
    if (!navigator.geolocation) {
      this.checked = false
    } else {
      Store.set('geoLocate', this.checked)
    }
  })

  $('#lock-marker-switch').change(function () {
    Store.set('lockMarker', this.checked)
    searchMarker.setDraggable(!this.checked)
  })

  $('#search-switch').change(function () {
    searchControl(this.checked ? 'on' : 'off')
  })

  $('#start-at-user-location-switch').change(function () {
    Store.set('startAtUserLocation', this.checked)
  })

  $('#follow-my-location-switch').change(function () {
    if (!navigator.geolocation) {
      this.checked = false
    } else {
      Store.set('followMyLocation', this.checked)
    }
    locationMarker.setDraggable(!this.checked)
  })

  if ($('#nav-accordion').length) {
    $('#nav-accordion').accordion({
      active: 0,
      collapsible: true,
      heightStyle: 'content'
    })
  }
})